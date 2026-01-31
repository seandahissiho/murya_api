import "dotenv/config";

import { Command } from "commander";
import OpenAI from "openai";
import { prisma } from "../src/config/db";
import { upsertTranslationsBulk } from "../src/i18n/upsert";
import { ENTITY_CONFIGS, EntityConfig } from "./i18n-translation-config";

type TranslationTask = {
    key: string;
    entity: string;
    entityId: string;
    field: string;
    langCode: string;
    text: string;
};

 

const program = new Command();
program
    .option("--langs <codes>", "Target languages, comma-separated", "en,fr")
    .option("--only <entities>", "Only these entities (comma-separated)")
    .option("--batch-size <n>", "DB batch size", "200")
    .option("--translate-batch <n>", "OpenAI batch size", "20")
    .option("--dry-run", "Show what would be translated without writing")
    .option("--force", "Translate and upsert even if translations already exist")
    .option("--model <name>", "OpenAI model override")
    .parse(process.argv);

const options = program.opts();

const targetLangs = String(options.langs)
    .split(",")
    .map((v: string) => v.trim())
    .filter(Boolean);

if (targetLangs.length === 0) {
    console.error("No target languages provided.");
    process.exit(1);
}

const onlyEntities = options.only
    ? String(options.only)
          .split(",")
          .map((v: string) => v.trim())
          .filter(Boolean)
    : null;

const dbBatchSize = Math.max(1, Number.parseInt(options.batchSize, 10) || 200);
const translateBatchSize = Math.max(1, Number.parseInt(options.translateBatch, 10) || 20);

const modelName =
    (options.model as string | undefined) ||
    process.env.OPENAI_TRANSLATION_MODEL ||
    "gpt-4o-mini";

const openai = (() => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error("OPENAI_API_KEY is required for translation.");
    }
    return new OpenAI({ apiKey });
})();

const cleanText = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    return String(value).trim();
};

const chunk = <T,>(items: T[], size: number): T[][] => {
    const result: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        result.push(items.slice(i, i + size));
    }
    return result;
};

const translateCache = new Map<string, string>();

async function translateBatch(tasks: TranslationTask[], targetLang: string): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const pending: TranslationTask[] = [];

    for (const task of tasks) {
        const cacheKey = `${targetLang}::${task.text}`;
        const cached = translateCache.get(cacheKey);
        if (cached !== undefined) {
            result.set(task.key, cached);
        } else {
            pending.push(task);
        }
    }

    if (pending.length === 0) {
        return result;
    }

    const inputPayload = pending.map((task) => ({
        id: task.key,
        text: task.text,
        field: task.field,
        entity: task.entity,
    }));

    const systemPrompt =
        "You are a professional translator. Translate the text to the target language while preserving meaning, tone, punctuation, and formatting. " +
        "Keep proper nouns, acronyms, product names, slugs, and code identifiers unchanged. If the text is already in the target language, return it unchanged.";

    const userPrompt = `Target language: ${targetLang}.\n\nReturn ONLY valid JSON with the shape {\"translations\": [{\"id\": string, \"text\": string}]}.\n\nInput items:\n${JSON.stringify(
        inputPayload,
    )}`;

    const response = await openai.responses.create({
        model: modelName,
        input: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        text: { format: { type: "json_object" } },
    });

    const raw = response.output_text?.trim() ?? "";
    if (!raw) {
        throw new Error("OpenAI returned an empty response.");
    }

    const cleaned = raw
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/, "")
        .trim();

    let parsed: { translations?: { id: string; text: string }[] } | null = null;
    try {
        parsed = JSON.parse(cleaned);
    } catch (err) {
        throw new Error("Failed to parse OpenAI JSON output.");
    }

    const translations = parsed?.translations ?? [];
    for (const item of translations) {
        if (!item?.id) continue;
        const text = cleanText(item.text);
        result.set(item.id, text);
    }

    for (const task of pending) {
        if (!result.has(task.key)) {
            result.set(task.key, task.text);
        }
        const cacheKey = `${targetLang}::${task.text}`;
        translateCache.set(cacheKey, result.get(task.key) ?? task.text);
    }

    return result;
}

async function processEntity(config: EntityConfig, dryRun: boolean, force: boolean) {
    const model = (prisma as any)[config.model];
    if (!model || typeof model.findMany !== "function") {
        throw new Error(`Unknown Prisma model: ${config.model}`);
    }

    console.log(`\n==> ${config.entity}`);

    let cursor: string | undefined = undefined;
    let processed = 0;
    let created = 0;

    while (true) {
        const rows: any[] = await model.findMany({
            take: dbBatchSize,
            ...(cursor ? { cursor: { [config.idField]: cursor }, skip: 1 } : {}),
            orderBy: { [config.idField]: "asc" },
            ...(config.where ? { where: config.where } : {}),
            select: config.fields.reduce(
                (acc, field) => {
                    acc[field] = true;
                    return acc;
                },
                { [config.idField]: true } as Record<string, boolean>,
            ),
        });

        if (rows.length === 0) break;

        processed += rows.length;
        cursor = rows[rows.length - 1][config.idField];

        const ids = rows.map((row) => row[config.idField]);
        const existingRows = force
            ? []
            : await prisma.translation.findMany({
                  where: {
                      entity: config.entity,
                      entityId: { in: ids },
                      field: { in: config.fields },
                      langCode: { in: targetLangs },
                  },
                  select: { entityId: true, field: true, langCode: true },
              });

        const existing = new Set(
            existingRows.map((row) => `${row.entityId}::${row.field}::${row.langCode}`),
        );

        const tasks: TranslationTask[] = [];

        for (const row of rows) {
            const entityId = row[config.idField];
            for (const field of config.fields) {
                const sourceText = cleanText(row[field]);
                if (!sourceText) continue;
                for (const langCode of targetLangs) {
                    const key = `${entityId}::${field}::${langCode}`;
                    if (!force && existing.has(key)) continue;
                    tasks.push({
                        key,
                        entity: config.entity,
                        entityId,
                        field,
                        langCode,
                        text: sourceText,
                    });
                }
            }
        }

        if (tasks.length === 0) {
            continue;
        }

        const tasksByLang = new Map<string, TranslationTask[]>();
        for (const task of tasks) {
            const bucket = tasksByLang.get(task.langCode) ?? [];
            bucket.push(task);
            tasksByLang.set(task.langCode, bucket);
        }

        const newRows: { entity: string; entityId: string; field: string; langCode: string; value: string }[] = [];

        for (const [langCode, langTasks] of tasksByLang.entries()) {
            const batches = chunk(langTasks, translateBatchSize);
            for (const batch of batches) {
                const translations = await translateBatch(batch, langCode);
                for (const task of batch) {
                    const value = translations.get(task.key) ?? task.text;
                    newRows.push({
                        entity: task.entity,
                        entityId: task.entityId,
                        field: task.field,
                        langCode: task.langCode,
                        value,
                    });
                }
            }
        }

        if (dryRun) {
            created += newRows.length;
            console.log(`- batch: ${rows.length} rows, ${newRows.length} translations (dry-run)`);
            continue;
        }

        const upsertChunks = chunk(newRows, 200);
        for (const group of upsertChunks) {
            if (force) {
                await upsertTranslationsBulk(group);
            } else {
                await prisma.translation.createMany({
                    data: group,
                    skipDuplicates: true,
                });
            }
        }

        created += newRows.length;
        console.log(`- batch: ${rows.length} rows, ${newRows.length} translations saved`);
    }

    console.log(`Completed ${config.entity}: ${processed} rows scanned, ${created} translations queued.`);
}

async function main() {
    const selectedConfigs = ENTITY_CONFIGS.filter((cfg) =>
        onlyEntities ? onlyEntities.includes(cfg.entity) : true,
    );

    if (selectedConfigs.length === 0) {
        console.error("No matching entities to process.");
        process.exit(1);
    }

    console.log(`Target languages: ${targetLangs.join(", ")}`);
    console.log(`Model: ${modelName}`);
    console.log(`DB batch size: ${dbBatchSize}`);
    console.log(`OpenAI batch size: ${translateBatchSize}`);
    console.log(`Dry run: ${options.dryRun ? "yes" : "no"}`);
    console.log(`Force: ${options.force ? "yes" : "no"}`);

    for (const config of selectedConfigs) {
        await processEntity(config, Boolean(options.dryRun), Boolean(options.force));
    }
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (err) => {
        console.error(err);
        await prisma.$disconnect();
        process.exit(1);
    });
