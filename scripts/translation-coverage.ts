import "dotenv/config";

import { Command } from "commander";
import { prisma } from "../src/config/db";
import { ENTITY_CONFIGS } from "./i18n-translation-config";

type MissingRow = {
    entity: string;
    entityId: string;
    field: string;
    langCode: string;
    sourceText?: string;
};

const program = new Command();
program
    .option("--langs <codes>", "Target languages, comma-separated", "en,fr")
    .option("--only <entities>", "Only these entities (comma-separated)")
    .option("--batch-size <n>", "DB batch size", "200")
    .option("--limit-missing <n>", "Limit number of missing rows printed", "200")
    .option("--no-source-text", "Do not include source text in missing rows output")
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
const limitMissing = Math.max(0, Number.parseInt(options.limitMissing, 10) || 0);
const includeSourceText = Boolean(options.sourceText);

const cleanText = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    return String(value).trim();
};

async function processEntity(config: (typeof ENTITY_CONFIGS)[number]) {
    const model = (prisma as any)[config.model];
    if (!model || typeof model.findMany !== "function") {
        throw new Error(`Unknown Prisma model: ${config.model}`);
    }

    let cursor: string | undefined = undefined;
    let total = 0;
    let translated = 0;
    const missing: MissingRow[] = [];

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

        cursor = rows[rows.length - 1][config.idField];

        const ids = rows.map((row) => row[config.idField]);
        const existingRows = await prisma.translation.findMany({
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

        for (const row of rows) {
            const entityId = row[config.idField];
            for (const field of config.fields) {
                const sourceText = cleanText(row[field]);
                if (!sourceText) continue;
                for (const langCode of targetLangs) {
                    total += 1;
                    const key = `${entityId}::${field}::${langCode}`;
                    if (existing.has(key)) {
                        translated += 1;
                    } else if (missing.length < limitMissing || limitMissing === 0) {
                        missing.push({
                            entity: config.entity,
                            entityId,
                            field,
                            langCode,
                            ...(includeSourceText ? { sourceText } : {}),
                        });
                    }
                }
            }
        }
    }

    return { total, translated, missing };
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
    console.log(`DB batch size: ${dbBatchSize}`);
    console.log(`Missing rows limit: ${limitMissing === 0 ? "unlimited" : limitMissing}`);
    console.log(`Include source text: ${includeSourceText ? "yes" : "no"}`);

    let grandTotal = 0;
    let grandTranslated = 0;
    const allMissing: MissingRow[] = [];

    for (const config of selectedConfigs) {
        const { total, translated, missing } = await processEntity(config);
        grandTotal += total;
        grandTranslated += translated;
        allMissing.push(...missing);

        const pct = total === 0 ? 100 : Math.round((translated / total) * 10000) / 100;
        console.log(`- ${config.entity}: ${translated}/${total} (${pct}%)`);
    }

    const overallPct = grandTotal === 0 ? 100 : Math.round((grandTranslated / grandTotal) * 10000) / 100;
    console.log(`\nOverall: ${grandTranslated}/${grandTotal} (${overallPct}%)`);

    if (allMissing.length === 0) {
        console.log("\nNo missing translations.");
        return;
    }

    console.log(`\nMissing translations (${allMissing.length}):`);
    for (const row of allMissing) {
        if (includeSourceText) {
            console.log(
                `${row.entity}\t${row.entityId}\t${row.field}\t${row.langCode}\t${row.sourceText ?? ""}`,
            );
        } else {
            console.log(`${row.entity}\t${row.entityId}\t${row.field}\t${row.langCode}`);
        }
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
