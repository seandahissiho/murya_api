import { PrismaClient, JobProgressionLevel } from "@prisma/client";
import path from "path";

const prisma = new PrismaClient();

type KiviatPayload = {
    jobSlug: string;
    families: { name: string; slug: string }[];
    levels: {
        name: string;
        slug: string; // "debutant" | "junior" | "intermediaire" | "senior"
        kiviatValues: Record<string, number>; // { vision: 2, analyse: 1, ... }
    }[];
};

const LEVEL_SLUG_TO_ENUM: Record<string, JobProgressionLevel> = {
    junior: JobProgressionLevel.JUNIOR,
    midlevel: JobProgressionLevel.MIDLEVEL,
    mid_level: JobProgressionLevel.MIDLEVEL,
    senior: JobProgressionLevel.SENIOR,
    expert: JobProgressionLevel.EXPERT,
};

/**
 * Importe / met à jour les valeurs Kiviat pour un Job à partir du JSON fourni.
 * - Cherche le Job par slug
 * - Cherche les familles par slug
 * - Pour chaque niveau (Débutant, Junior, ...) et chaque famille,
 *   upsert une ligne JobKiviat(jobId, competenciesFamilyId, level) avec value 1–5.
 */
export async function importJobKiviatFromJson(payload: KiviatPayload) {
    // 1) Récupérer le job
    const job = await prisma.job.findUnique({
        where: { slug: payload.jobSlug },
    });

    if (!job) {
        throw new Error(`Job with slug "${payload.jobSlug}" not found`);
    }

    // 2) Récupérer les familles de compétences par slug
    const familySlugs = payload.families.map((f) => f.slug);
    const familiesInDb = await prisma.competenciesFamily.findMany({
        where: { slug: { in: familySlugs } },
    });

    const familiesBySlug = new Map(
        familiesInDb.map((f) => [f.slug, f])
    );

    // Vérifier qu'on a bien toutes les familles demandées
    const missingFamilies = familySlugs.filter(
        (slug) => !familiesBySlug.has(slug)
    );
    if (missingFamilies.length > 0) {
        throw new Error(
            `Missing CompetenciesFamily for slugs: ${missingFamilies.join(", ")}`
        );
    }

    // 3) Construire les opérations d'upsert JobKiviat
    const txOps: ReturnType<typeof prisma.jobKiviat.upsert>[] = [];

    for (const levelDef of payload.levels) {
        const levelEnum = LEVEL_SLUG_TO_ENUM[levelDef.slug.toLowerCase()];
        if (!levelEnum) {
            throw new Error(
                `Unknown level slug "${levelDef.slug}". Expected one of: ${Object.keys(
                    LEVEL_SLUG_TO_ENUM
                ).join(", ")}`
            );
        }

        for (const [familySlug, value] of Object.entries(levelDef.kiviatValues)) {
            const family = familiesBySlug.get(familySlug);
            if (!family) {
                throw new Error(
                    `Family slug "${familySlug}" in kiviatValues is not present in "families" array`
                );
            }

            if (typeof value !== "number" || value < 1 || value > 5) {
                throw new Error(
                    `Invalid Kiviat value ${value} for family "${familySlug}" and level "${levelDef.slug}". Expected integer 1–5.`
                );
            }

            txOps.push(
                prisma.jobKiviat.upsert({
                    where: {
                        // Composite unique généré par Prisma pour @@unique([jobId, competenciesFamilyId, level])
                        jobId_competenciesFamilyId_level: {
                            jobId: job.id,
                            competenciesFamilyId: family.id,
                            level: levelEnum,
                        },
                    },
                    update: {
                        value,
                    },
                    create: {
                        jobId: job.id,
                        competenciesFamilyId: family.id,
                        level: levelEnum,
                        value,
                    },
                })
            );
        }
    }

    // 4) Exécuter en transaction
    await prisma.$transaction(txOps);
}

function retrieveJsonContent(jsonPathBase: string) {
    const fs = require("fs");
    try {
        const splitPath = jsonPathBase.split(path.sep);
        const jsonPath = path.join(__dirname, "..", ...splitPath);
        const content = fs.readFileSync(jsonPath, "utf-8");
        const payload: KiviatPayload = JSON.parse(content);
        return payload;
    } catch (error) {
        console.error(`Error reading JSON file at ${jsonPathBase}:`, error);
        throw error;
    }
}

if (require.main === module) {
    const jsonPath = 'data/jobs/product_manager/kiviat.json';
    const jsonContent = retrieveJsonContent(jsonPath);
    importJobKiviatFromJson(jsonContent)
        .then(() => {
            console.log(`✅ Kiviat values imported for job "${jsonContent.jobSlug}"`);
            process.exit(0);
        })
        .catch((err) => {
            console.error("❌ Error importing Kiviat values:", err);
            process.exit(1);
        });
}
