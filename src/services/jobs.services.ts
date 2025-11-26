import {PrismaClient} from '@prisma/client';
import {resolveFields} from '../i18n/translate';
import {prisma} from "../config/db";
import {CompetencyType, Level} from '@prisma/client';
import slugify from "slugify";

/**
 * Recherche de jobs avec support multilingue (lang = 'fr' ou 'en').
 */
interface SearchOptions {
    page?: number;
    perPage?: number;
    lang?: string;
}

/**
 * Recherche de jobs avec pagination + multilingue
 */
export const searchJobs = async (
    query: string,
    {page = 1, perPage = 20, lang = 'en'}: SearchOptions = {},
) => {
    const skip = (page - 1) * perPage;

    const where: any = {
        OR: [
            {title: {contains: query, mode: 'insensitive'}},
            {normalizedName: {contains: query, mode: 'insensitive'}},
            {description: {contains: query, mode: 'insensitive'}},
            {
                jobFamily: {
                    name: {contains: query, mode: 'insensitive'},
                },
            },
        ],
    };

    const [jobs, total] = await Promise.all([
        prisma.job.findMany({
            where,
            orderBy: {title: 'asc'},
            // include: {jobFamily: true},
            skip,
            take: perPage,
        }),
        prisma.job.count({where}),
    ]);

    const localizedJobs = await Promise.all(
        jobs.map(async (job) => {
            const localizedJob = await resolveFields({
                entity: 'Job',
                entityId: job.id,
                fields: ['title', 'description'],
                lang,
                base: job,
            });

            const localizedJobFamily = job.jobFamily
                ? await resolveFields({
                    entity: 'JobFamily',
                    entityId: job.jobFamily.id,
                    fields: ['name'],
                    lang,
                    base: job.jobFamily,
                })
                : null;

            return {...localizedJob, jobFamily: localizedJobFamily};
        }),
    );

    return {
        items: localizedJobs,
        pagination: {
            page,
            perPage,
            total,
            totalPages: Math.ceil(total / perPage),
        },
    };
};
/**
 * Récupère les détails d’un job, avec ses familles de compétences et compétences,
 * tout en appliquant les traductions selon la langue demandée.
 */
export const getJobDetails = async (jobId: string, lang: string = 'en') => {
    const job = await prisma.job.findUnique({
        where: {id: jobId},
        include: {
            jobFamily: true,
            competenciesFamilies: {
                include: {
                    competencies: true,
                    parent: true,
                    children: true,
                },
            },
            competencies: {
                include: {
                    families: {
                        include: {
                            competencies: true,
                            parent: true,
                            children: true,
                        },
                    },
                },
            },
        },
    });

    if (!job) return null;

    // Localiser le job
    const localizedJob = await resolveFields({
        entity: 'Job',
        entityId: job.id,
        fields: ['title', 'description'],
        lang,
        base: job,
    });

    // Localiser la JobFamily
    const localizedJobFamily = job.jobFamily
        ? await resolveFields({
            entity: 'JobFamily',
            entityId: job.jobFamily.id,
            fields: ['name'],
            lang,
            base: job.jobFamily,
        })
        : null;

    // Localiser les familles de compétences
    const localizedFamilies = await Promise.all(
        job.competenciesFamilies.map(async (fam) => {
            const locFam = await resolveFields({
                entity: 'CompetenciesFamily',
                entityId: fam.id,
                fields: ['name', 'description'],
                lang,
                base: fam,
            });

            return {
                ...locFam,
                parent: fam.parent,
                children: fam.children,
                competencies: fam.competencies,
            };
        }),
    );

    // Localiser les compétences
    const localizedCompetencies = await Promise.all(
        job.competencies.map(async (comp) => {
            return await resolveFields({
                entity: 'Competency',
                entityId: comp.id,
                fields: ['name'],
                lang,
                base: comp,
            });
        }),
    );

    return {
        ...localizedJob,
        jobFamily: localizedJobFamily,
        competenciesFamilies: localizedFamilies,
        competencies: localizedCompetencies,
    };
};

/**
 * Récupère les détails d’une famille de compétences liée à un job.
 */
export const getCompetencyFamilyDetailsForJob = async (
    jobId: string,
    cfId: string,
    lang: string = 'en',
) => {
    const job = await prisma.job.findUnique({where: {id: jobId}});
    if (!job) throw new Error('Job not found');

    const family = await prisma.competenciesFamily.findUnique({
        where: {id: cfId},
    });
    if (!family) throw new Error('Competency Family not found');

    const competencies = await prisma.competency.findMany({
        where: {
            jobs: {some: {id: jobId}},
            families: {some: {id: cfId}},
        },
    });

    const localizedJob = await resolveFields({
        entity: 'Job',
        entityId: job.id,
        fields: ['title', 'description'],
        lang,
        base: job,
    });

    const localizedFamily = await resolveFields({
        entity: 'CompetenciesFamily',
        entityId: family.id,
        fields: ['name', 'description'],
        lang,
        base: family,
    });

    const localizedCompetencies = await Promise.all(
        competencies.map((comp) =>
            resolveFields({
                entity: 'Competency',
                entityId: comp.id,
                fields: ['name'],
                lang,
                base: comp,
            }),
        ),
    );

    return {
        job: localizedJob,
        family: localizedFamily,
        competencies: localizedCompetencies,
    };
};

export interface CompetencyDto {
    kind?: string;
    name: string;
    slug?: string;
    acquisitionLevel?: string;
    family?: string;
    subFamily?: string;
    description?: string;
}

export interface CompetencySubFamilyDto {
    name: string;
    competencies?: CompetencyDto[];
}

export interface CompetencyFamilyDto {
    name: string;
    subFamilies?: CompetencySubFamilyDto[];
}

export interface JobCompetencyPayload {
    jobTitle: string;
    normalizedJobName?: string;
    jobDescription?: string;
    families?: CompetencyFamilyDto[];
}

const normalizeName = (value: string) =>
    slugify(value, {lower: true, strict: true, trim: true, locale: 'fr'});

const mapKindToType = (kind?: string): CompetencyType => {
    if (kind?.toLowerCase() === 'savoiretre') return CompetencyType.SOFT_SKILL;
    return CompetencyType.HARD_SKILL;
};

const mapAcquisitionToLevel = (level?: string): Level => {
    const normalized = level?.toLowerCase();
    if (normalized === 'facile') return Level.EASY;
    if (normalized === 'difficile') return Level.HARD;
    if (normalized === 'expert') return Level.EXPERT;
    return Level.MEDIUM;
};

export const createJobWithCompetencies = async (payload: any) => {
    const jobNormalizedName = payload.normalizedJobName || normalizeName(payload.jobTitle);

    return prisma.$transaction(async (tx) => {
        const job = await tx.job.upsert({
            where: {normalizedName: jobNormalizedName},
            update: {
                title: payload.jobTitle,
                description: payload.jobDescription,
            },
            create: {
                title: payload.jobTitle,
                normalizedName: jobNormalizedName,
                description: payload.jobDescription,
            },
        });

        // delete old relations
        await tx.job.update({
            where: {id: job.id},
            data: {
                competenciesFamilies: {
                    set: [],
                },
                competencies: {
                    set: [],
                },
            },
        });

        const familyIds = new Set<string>();

        for (const family of payload.families ?? []) {
            const familyNormalizedName = normalizeName(family.name);

            const familyRecord = await tx.competenciesFamily.upsert({
                where: {normalizedName: familyNormalizedName},
                update: {name: family.name},
                create:

                    {
                    name: family.name,
                    normalizedName: familyNormalizedName,
                },
            });

            familyIds.add(familyRecord.id);

            for (const subFamily of family.subFamilies ?? []) {
                const subFamilyNormalized = normalizeName(subFamily.name);
                const subFamilyRecord = await tx.competenciesFamily.upsert({
                    where: {normalizedName: subFamilyNormalized},
                    update: {name: subFamily.name, parentId: familyRecord.id},
                    create: {
                        name: subFamily.name,
                        normalizedName: subFamilyNormalized,
                        parentId: familyRecord.id,
                    },
                });

                familyIds.add(subFamilyRecord.id);

                for (const competency of subFamily.competencies ?? []) {
                    const normalizedCompetencyName = competency.slug || normalizeName(competency.name);
                    const competencyRecord = await tx.competency.upsert({
                        where: {normalizedName: normalizedCompetencyName},
                        update: {
                            name: competency.name,
                            type: mapKindToType(competency.kind),
                            level: mapAcquisitionToLevel(competency.acquisitionLevel),
                        },
                        create: {
                            name: competency.name,
                            normalizedName: normalizedCompetencyName,
                            type: mapKindToType(competency.kind),
                            level: mapAcquisitionToLevel(competency.acquisitionLevel),
                        },
                    });

                    await tx.competency.update({
                        where: {id: competencyRecord.id},
                        data: {
                            families: {
                                connect: [
                                    {id: familyRecord.id},
                                    {id: subFamilyRecord.id},
                                ],
                            },
                            jobs: {connect: {id: job.id}},
                        },
                    });
                }
            }
        }

        if (familyIds.size > 0) {
            await tx.job.update({
                where: {id: job.id},
                data: {
                    competenciesFamilies: {
                        connect: Array.from(familyIds).map((id) => ({id})),
                    },
                },
            });
        }

        const jobWithRelations = await tx.job.findUnique({
            where: {id: job.id},
            include: {
                competenciesFamilies: true,
                competencies: true,
            },
        });
        return jobWithRelations;
    });
};

export const getJobDetailsByName = async (normalizedJobName: string, lang: string = 'en') => {
    const job = await prisma.job.findUnique({
        where: {normalizedName: normalizedJobName},
        select: {id: true},
    });

    if (!job) return null;

    return await getJobDetails(job.id, lang);
}