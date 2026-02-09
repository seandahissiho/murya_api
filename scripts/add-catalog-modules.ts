/* eslint-disable no-console */
import "dotenv/config";

import {ModuleStatus, ModuleVisibility, PrismaClient} from "@prisma/client";

const prisma = new PrismaClient();

type ModuleSeed = {
    slug: string;
    nameFr: string;
    nameEn: string;
    descriptionFr: string;
    descriptionEn: string;
};

const CATALOG_MODULES: ModuleSeed[] = [
    {
        slug: "personality-tests",
        nameFr: "Tests",
        nameEn: "Tests",
        descriptionFr:
            "Analyse ta personnalité professionnelle et identifie les environnements faits pour toi.",
        descriptionEn:
            "Analyze your professional personality and identify environments that suit you.",
    },
    {
        slug: "tool-catalog",
        nameFr: "Outils",
        nameEn: "Tools",
        descriptionFr:
            "Configure ta boîte à outils personnelle pour apprendre plus efficacement au quotidien.",
        descriptionEn:
            "Set up your personal toolbox to learn more effectively day to day.",
    },
];

const upsertTranslation = async (entityId: string, field: "name" | "description", lang: "fr" | "en", value: string) => {
    await prisma.translation.upsert({
        where: {
            entity_entityId_field_langCode: {
                entity: "Module",
                entityId,
                field,
                langCode: lang,
            },
        },
        update: {value},
        create: {
            entity: "Module",
            entityId,
            field,
            langCode: lang,
            value,
        },
    });
};

const upsertModule = async (module: ModuleSeed) => {
    const record = await prisma.module.upsert({
        where: {slug: module.slug},
        update: {
            name: module.nameFr,
            description: module.descriptionFr,
            status: ModuleStatus.ACTIVE,
            visibility: ModuleVisibility.PUBLIC,
            defaultOnLanding: false,
        },
        create: {
            slug: module.slug,
            name: module.nameFr,
            description: module.descriptionFr,
            status: ModuleStatus.ACTIVE,
            visibility: ModuleVisibility.PUBLIC,
            defaultOnLanding: false,
        },
    });

    await upsertTranslation(record.id, "name", "fr", module.nameFr);
    await upsertTranslation(record.id, "name", "en", module.nameEn);
    await upsertTranslation(record.id, "description", "fr", module.descriptionFr);
    await upsertTranslation(record.id, "description", "en", module.descriptionEn);

    return record;
};

const main = async () => {
    for (const module of CATALOG_MODULES) {
        const record = await upsertModule(module);
        console.log(`✓ Upserted module ${module.slug} (${record.id})`);
    }
};

main()
    .catch((err) => {
        console.error("Failed to add catalog modules:", err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
