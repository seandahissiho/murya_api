import "dotenv/config";

import { Command } from "commander";
import { prisma } from "../src/config/db";

type EntityConfig = {
    entity: "QuestGroup" | "QuestDefinition";
    model: "questGroup" | "questDefinition";
    idField: "id";
    fields: string[];
};

const ENTITY_CONFIGS: EntityConfig[] = [
    { entity: "QuestGroup", model: "questGroup", idField: "id", fields: ["title", "description"] },
    { entity: "QuestDefinition", model: "questDefinition", idField: "id", fields: ["title", "description"] },
];

const program = new Command();
program
    .option("--only <entities>", "Only these entities (comma-separated)")
    .option("--batch-size <n>", "DB batch size", "200")
    .option("--limit <n>", "Limit number of rows printed per entity", "0")
    .parse(process.argv);

const options = program.opts();

const onlyEntities = options.only
    ? String(options.only)
          .split(",")
          .map((v: string) => v.trim())
          .filter(Boolean)
    : null;

const dbBatchSize = Math.max(1, Number.parseInt(options.batchSize, 10) || 200);
const limit = Math.max(0, Number.parseInt(options.limit, 10) || 0);

const cleanText = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    return String(value).trim();
};

async function logEntity(config: EntityConfig) {
    const model = (prisma as any)[config.model];
    if (!model || typeof model.findMany !== "function") {
        throw new Error(`Unknown Prisma model: ${config.model}`);
    }

    console.log(`\n==> ${config.entity}`);

    let cursor: string | undefined = undefined;
    let printed = 0;

    while (true) {
        const rows: any[] = await model.findMany({
            take: dbBatchSize,
            ...(cursor ? { cursor: { [config.idField]: cursor }, skip: 1 } : {}),
            orderBy: { [config.idField]: "asc" },
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
        const translations = await prisma.translation.findMany({
            where: {
                entity: config.entity,
                entityId: { in: ids },
                field: { in: config.fields },
                langCode: { in: ["fr", "en"] },
            },
            select: { entityId: true, field: true, langCode: true, value: true },
        });

        const byKey = new Map<string, string>();
        for (const t of translations) {
            byKey.set(`${t.entityId}::${t.field}::${t.langCode}`, t.value);
        }

        for (const row of rows) {
            const entityId = row[config.idField];
            for (const field of config.fields) {
                const base = cleanText(row[field]);
                const fr = byKey.get(`${entityId}::${field}::fr`) ?? "";
                const en = byKey.get(`${entityId}::${field}::en`) ?? "";
                console.log(
                    `${config.entity}\t${entityId}\t${field}\tFR:\t${fr}\tEN:\t${en}\tBASE:\t${base}`,
                );
                printed += 1;
                if (limit > 0 && printed >= limit) {
                    return;
                }
            }
        }
    }
}

async function main() {
    const selectedConfigs = ENTITY_CONFIGS.filter((cfg) =>
        onlyEntities ? onlyEntities.includes(cfg.entity) : true,
    );

    if (selectedConfigs.length === 0) {
        console.error("No matching entities to process.");
        process.exit(1);
    }

    console.log(`Batch size: ${dbBatchSize}`);
    console.log(`Limit: ${limit === 0 ? "unlimited" : limit}`);

    for (const config of selectedConfigs) {
        await logEntity(config);
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
