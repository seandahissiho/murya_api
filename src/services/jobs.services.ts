import {CompetencyType, Level, QuizType} from '@prisma/client';
import {resolveFields} from '../i18n/translate';
import {prisma} from "../config/db";
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

export interface PositioningQuizResponsePayload {
    text: string;
    isCorrect: boolean;
    metadata?: any;
    index: number;
}

export interface PositioningQuizQuestionPayload {
    id: string;
    text: string;
    competencySlug: string;
    difficulty: string;
    timeLimitInSeconds: number;
    points: number;
    mediaUrl?: string | null;
    metadata?: any;
    index: number;
    responses: PositioningQuizResponsePayload[];
}

export interface PositioningQuizPayload {
    index: number;
    title: string;
    description?: string;
    questions: PositioningQuizQuestionPayload[];
}

export interface PositioningQuizImportPayload {
    jobTitle: string;
    normalizedJobName?: string;
    quizzes: PositioningQuizPayload[];
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

const difficultyToLevel = (difficulty?: string): Level => {
    const normalized = difficulty?.toUpperCase();
    if (normalized === 'EASY') return Level.EASY;
    if (normalized === 'MEDIUM') return Level.MEDIUM;
    if (normalized === 'HARD' || normalized === 'DIFFICULT') return Level.HARD;
    if (normalized === 'EXPERT') return Level.EXPERT;
    return Level.MEDIUM;
};

const pickHighestLevel = (levels: Level[]): Level => {
    const weights: Record<Level, number> = {
        [Level.EASY]: 1,
        [Level.MEDIUM]: 2,
        [Level.HARD]: 3,
        [Level.EXPERT]: 4,
        [Level.MIX]: 0,
    };

    return levels.reduce<Level>((best, current) => {
        return weights[current] > weights[best] ? current : best;
    }, Level.EASY);
};

export const createJobWithCompetencies = async (payload: any) => {
    const jobNormalizedName = payload.normalizedJobName || normalizeName(payload.jobTitle);

    return prisma.$transaction(async (tx) => {

        if (payload.families.length != 5) {
            throw new Error(`A job must be linked to exactly 5 CompetenciesFamily (found: ${payload.families.length})`);
        }

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

        const familyIds = new Set<string>();
        const subFamilyIds = new Set<string>();
        const competencyIds = new Set<string>();

        for (const family of payload.families ?? []) {
            const familyNormalizedName = normalizeName(family.name);

            const familyRecord = await tx.competenciesFamily.upsert({
                where: {normalizedName: familyNormalizedName},
                update: {name: family.name},
                create: {
                        name: family.name,
                        normalizedName: familyNormalizedName,
                    },
            });
            // delete old relations
            await tx.competenciesFamily.update({
                where: {id: familyRecord.id},
                data: {
                    children: {
                        set: [],
                    },
                    competencies: {
                        set: [],
                    }
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

                // delete old relations
                await tx.competenciesFamily.update({
                    where: {id: subFamilyRecord.id},
                    data: {
                        competencies: {
                            set: [],
                        }
                    },
                });

                subFamilyIds.add(subFamilyRecord.id);

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
                    competencyIds.add(competencyRecord.id);
                }
            }
        }

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

        await tx.job.update({
            where: {id: job.id},
            data: {
                competenciesFamilies: {
                    connect: Array.from(familyIds).map((id) => ({id})),
                },
                competencies: {
                    connect: Array.from(competencyIds).map((id) => ({id})),
                }
            },
        });

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

const normalizeCompetencySlug = (slug: string) => normalizeName(slug.replace(/_/g, '-'));

export const savePositioningQuizzesForJob = async (payload: PositioningQuizImportPayload) => {
    const normalizedJobName = payload.normalizedJobName || normalizeName(payload.jobTitle);

    return prisma.$transaction(async (tx) => {
        const job = await tx.job.findUnique(
            {where: {normalizedName: normalizedJobName}},
        );
        if (!job) {
            throw new Error(`Job not found: ${normalizedJobName}`);
        }

        // set old positionning quizzes to inactive if they are linked to the job
        await tx.quiz.updateMany({
            where: {
                jobId: job.id,
                type: QuizType.POSITIONING,
            },
            data: {
                isActive: false,
            },
        });

        // await tx.quiz.deleteMany({where: {jobId: job.id}});

        const competencySlugs = new Set<string>();
        for (const quiz of payload.quizzes ?? []) {
            for (const question of quiz.questions ?? []) {
                competencySlugs.add(normalizeCompetencySlug(question.competencySlug));
                competencySlugs.add(normalizeName(question.competencySlug));
            }
        }

        const competencies = competencySlugs.size
            ? await tx.competency.findMany({
                where: {jobs: {some: {id: job.id}}},
            })
            : [];

        const competencyMap = new Map<string, string>();
        competencies.forEach((c) => competencyMap.set(c.normalizedName, c.id));

        const resolveCompetencyId = (slug: string): string | undefined => {
            return competencyMap.get(slug);
            // const normalizedSlug = normalizeCompetencySlug(slug);
            // const fallbackSlug = normalizeName(slug);
            // return competencyMap.get(slug) || competencyMap.get(slug);
        };

        const createdQuizzes = [];

        const sortedQuizzes = [...(payload.quizzes ?? [])].sort((a, b) => a.index - b.index);

        for (const quizPayload of sortedQuizzes) {
            const questionLevels = quizPayload.questions.map((q) => difficultyToLevel(q.difficulty));
            const quizLevel = pickHighestLevel(questionLevels);

            const data = {
                jobId: job.id,
                title: quizPayload.title,
                description: quizPayload.description ?? '',
                level: quizLevel,
                questions: {
                    create: quizPayload.questions
                        .sort((a, b) => a.index - b.index)
                        .map((question) => {
                            const competencyId = resolveCompetencyId(question.competencySlug);
                            if (!competencyId) {
                                throw new Error(
                                    `Compétence introuvable pour le slug "${question.competencySlug}"`,
                                );
                            }

                            return {
                                text: question.text,
                                competencyId,
                                timeLimitInSeconds: question.timeLimitInSeconds,
                                points: question.points,
                                level: difficultyToLevel(question.difficulty),
                                mediaUrl: question.mediaUrl ?? '',
                                index: question.index,
                                metadata: question.metadata ?? undefined,
                                responses: {
                                    create: question.responses
                                        .sort((a, b) => a.index - b.index)
                                        .map((response) => ({
                                            text: response.text,
                                            metadata: response.metadata ?? undefined,
                                            isCorrect: response.isCorrect,
                                            index: response.index,
                                        })),
                                },
                            };
                        }),
                },
            };

            const createdQuiz = await tx.quiz.create({
                data: data,
                include: {
                    questions: {
                        include: {
                            responses: true,
                        },
                    },
                },
            });

            createdQuizzes.push(createdQuiz);
        }

        // link quizzes to job
        await tx.job.update({
            where: {id: job.id},
            data: {
                quizzes: {
                    connect: createdQuizzes.map((q) => ({id: q.id})),
                },
            },
        });

        return {job, quizzes: createdQuizzes};
    });
};
