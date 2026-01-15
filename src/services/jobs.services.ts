import {CompetencyType, Level, QuizType} from '@prisma/client';
import {resolveFields} from '../i18n/translate';
import {prisma} from "../config/db";

/**
 * Recherche de jobs avec support multilingue (lang = 'fr' ou 'en').
 */
export interface SearchOptions {
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
        AND: [
            {isActive: true},
        ],
        OR: [
            {title: {contains: query, mode: 'insensitive'}},
            {slug: {contains: query, mode: 'insensitive'}},
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
        jobs.map(async (job: any) => {
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

export const getJobsFamiliesAndSubFamilies = async ({page = 1, perPage = 20, lang = 'en'}: SearchOptions) => {
    const skip = (page - 1) * perPage;
    const [jobs, total] = await Promise.all([
        prisma.job.findMany({
            orderBy: {title: 'asc'},
            skip,
            take: perPage,
            include: {
                competenciesFamilies: true,
                competenciesSubfamilies: true,
                competencies: true,
            }
        }),
        prisma.job.count({}),
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

            const localizedCompetenciesFamilies = await resolveFields({
                entity: 'CompetenciesFamily',
                entityId: job.id,
                fields: ['name', 'description'],
                lang,
                base: job.competenciesFamilies,
            });

            const localizedCompetenciesSubfamilies = await resolveFields({
                entity: 'CompetenciesSubFamily',
                entityId: job.id,
                fields: ['name', 'description'],
                lang,
                base: job.competenciesSubfamilies,
            });

            const localizedCompetencies = await resolveFields({
                entity: 'Competency',
                entityId: job.id,
                fields: ['name'],
                lang,
                base: job.competencies,
            });


            return {...localizedJob, competenciesFamilies: localizedCompetenciesFamilies, competenciesSubfamilies: localizedCompetenciesSubfamilies, competencies: localizedCompetencies};
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
}

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
                    subFamilies: true,
                },
            },
            competencies: {
                include: {
                    families: {
                        include: {
                            competencies: true,
                            subFamilies: true,
                        },
                    },
                },
            },
            kiviats: true,
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
                subFamilies: fam.subFamilies,
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

    // Localiser les Kiviats
    const localizedKiviats = await Promise.all(
        job.kiviats.map(async (kiviat) => {
            return await resolveFields({
                entity: 'JobKiviat',
                entityId: kiviat.id,
                fields: ['level'],
                lang,
                base: kiviat,
            });
        }),
    );

    return {
        ...localizedJob,
        jobFamily: localizedJobFamily,
        competenciesFamilies: localizedFamilies,
        competencies: localizedCompetencies,
        kiviats: localizedKiviats,
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
    competencies?: CompetencyDto[];
}

export interface JobCompetencyPayload {
    jobTitle: string;
    slug?: string;
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
    slug?: string;
    quizzes: PositioningQuizPayload[];
}

type CompetencyCandidate = {
    name: string;
    normalizedName: string;
    source: 'payload' | 'database';
    context?: string;
};

type NearDuplicateWarning = {
    first: CompetencyCandidate;
    second: CompetencyCandidate;
    similarity: number;
};

const levenshteinDistance = (a: string, b: string): number => {
    const dp: number[][] = Array.from({length: a.length + 1}, (_, i) =>
        Array.from({length: b.length + 1}, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
    );

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost,
            );
        }
    }

    return dp[a.length][b.length];
};

const similarityScore = (a: string, b: string): number => {
    const maxLength = Math.max(a.length, b.length);
    if (maxLength === 0) return 1;

    const distance = levenshteinDistance(a, b);
    return 1 - distance / maxLength;
};

const detectNearDuplicateCompetencies = (
    payloadCompetencies: CompetencyCandidate[],
    existingCompetencies: CompetencyCandidate[],
    threshold: number = 0.82,
): NearDuplicateWarning[] => {
    const warnings: NearDuplicateWarning[] = [];

    const checkPair = (first: CompetencyCandidate, second: CompetencyCandidate) => {
        if (first.normalizedName === second.normalizedName) return;
        const score = similarityScore(first.normalizedName, second.normalizedName);
        if (score >= threshold) {
            warnings.push({
                first,
                second,
                similarity: Number(score.toFixed(2)),
            });
        }
    };

    // Compare payload entries with each other.
    for (let i = 0; i < payloadCompetencies.length; i++) {
        for (let j = i + 1; j < payloadCompetencies.length; j++) {
            checkPair(payloadCompetencies[i], payloadCompetencies[j]);
        }
    }

    // Compare payload entries with existing database competencies.
    for (const payload of payloadCompetencies) {
        for (const existing of existingCompetencies) {
            checkPair(payload, existing);
        }
    }

    return warnings;
};


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
    const jobSlug = payload.slug;

    return prisma.$transaction(async (tx) => {

        const payloadCompetencies: CompetencyCandidate[] = [];
        for (const family of payload.families ?? []) {
            for (const competency of family.competencies ?? []) {
                const normalizedCompetencyName = competency.slug;
                payloadCompetencies.push({
                    name: competency.name,
                    normalizedName: normalizedCompetencyName,
                    source: 'payload',
                    context: family.name,
                });
            }
            for (const subFamily of family.subFamilies ?? []) {
                for (const competency of subFamily.competencies ?? []) {
                    const normalizedCompetencyName = competency.slug;
                    payloadCompetencies.push({
                        name: competency.name,
                        normalizedName: normalizedCompetencyName,
                        source: 'payload',
                        context: `${family.name} > ${subFamily.name}`,
                    });
                }
            }
        }

        const existingCompetencies = await tx.competency.findMany({
            select: {id: true, name: true, slug: true},
        });

        const nearDuplicateWarnings = detectNearDuplicateCompetencies(
            payloadCompetencies,
            existingCompetencies.map((comp) => ({
                name: comp.name,
                normalizedName: comp.slug,
                source: 'database',
            })),
        );

        if (nearDuplicateWarnings.length) {
            console.warn(
                'Near-duplicate competencies detected (similarity >= 0.82):',
                nearDuplicateWarnings,
            );
        }


        if (payload.families.length != 5) {
            throw new Error(`A job must be linked to exactly 5 CompetenciesFamily (found: ${payload.families.length})`);
        }

        const job = await tx.job.upsert({
            where: {slug: jobSlug},
            update: {
                title: payload.jobTitle,
                description: payload.jobDescription,
                // disconnect all relations first
                competenciesFamilies: {
                    set: [],
                },
                competenciesSubfamilies: {
                    set: [],
                },
                competencies: {
                    set: [],
                }
            },
            create: {
                title: payload.jobTitle,
                slug: jobSlug,
                description: payload.jobDescription,
            },
        });


        const familyIds = new Set<string>();
        const subFamilyIds = new Set<string>();
        const competencyIds = new Set<string>();

        for (const family of payload.families ?? []) {
            const familySlug = family.slug;

            const familyRecord = await tx.competenciesFamily.upsert({
                where: {slug: familySlug},
                update: {
                    name: family.name,
                    jobs: {
                        connect: {id: job.id},
                    },
                },
                create: {
                    name: family.name,
                    slug: familySlug,
                    jobs: {
                        connect: {id: job.id},
                    },
                },
            });


            familyIds.add(familyRecord.id);

            const familyCompetencyIds = new Set<string>();
            const familySubFamilyIds = new Set<string>();
            for (const competency of family.competencies ?? []) {
                const normalizedCompetencyName = competency.slug;
                const competencyRecord = await tx.competency.upsert({
                    where: {slug: normalizedCompetencyName},
                    update: {
                        name: competency.name,
                        type: mapKindToType(competency.kind),
                        level: mapAcquisitionToLevel(competency.acquisitionLevel),
                    },
                    create: {
                        name: competency.name,
                        slug: normalizedCompetencyName,
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
                            ],
                        },
                        jobs: {connect: {id: job.id}},
                    },
                });
                familyCompetencyIds.add(competencyRecord.id);
                competencyIds.add(competencyRecord.id);
            }
            for (const subFamily of family.subFamilies ?? []) {
                const subFamilyNormalized = subFamily.slug;
                const subFamilyRecord = await tx.competenciesSubFamily.upsert({
                    where: {slug: subFamilyNormalized},
                    update: {
                        name: subFamily.name,
                        familyId: familyRecord.id,
                    },
                    create: {
                        name: subFamily.name,
                        slug: subFamilyNormalized,
                        familyId: familyRecord.id,
                    },
                });

                familySubFamilyIds.add(subFamilyRecord.id);
                subFamilyIds.add(subFamilyRecord.id);

                const subFamilyCompetencyIds = new Set<string>();
                for (const competency of subFamily.competencies ?? []) {
                    const normalizedCompetencyName = competency.slug;
                    const competencyRecord = await tx.competency.upsert({
                        where: {slug: normalizedCompetencyName},
                        update: {
                            name: competency.name,
                            type: mapKindToType(competency.kind),
                            level: mapAcquisitionToLevel(competency.acquisitionLevel),
                        },
                        create: {
                            name: competency.name,
                            slug: normalizedCompetencyName,
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
                                ],
                            },
                            subFamilies: {
                                connect: [
                                    {id: subFamilyRecord.id},
                                ],
                            },
                            jobs: {connect: {id: job.id}},
                            jobSubfamilyCompetencies: {
                                upsert: {
                                    where: {
                                        jobId_competencyId: {
                                            jobId: job.id,
                                            competencyId: competencyRecord.id,
                                        }
                                    },
                                    update: {
                                        jobId: job.id,
                                        subFamilyId: subFamilyRecord.id,
                                    },
                                    create: {
                                        jobId: job.id,
                                        subFamilyId: subFamilyRecord.id,
                                    }
                                },
                            }
                        },
                    });
                    subFamilyCompetencyIds.add(competencyRecord.id)
                    familyCompetencyIds.add(competencyRecord.id);
                    competencyIds.add(competencyRecord.id);
                }

                // connect competencies to subFamily
                await tx.competenciesSubFamily.update({
                    where: {id: subFamilyRecord.id},
                    data: {
                        competencies: {
                            connect: Array.from(subFamilyCompetencyIds).map((id) => ({id})),
                        },
                    },
                });
            }

            if (familySubFamilyIds.size) {
                // connect sub-families to family
                await tx.competenciesFamily.update({
                    where: {id: familyRecord.id},
                    data: {
                        subFamilies: {
                            connect: Array.from(familySubFamilyIds).map((id) => ({id})),
                        },
                    },
                });
            }

            // connect competencies to family
            await tx.competenciesFamily.update({
                where: {id: familyRecord.id},
                data: {
                    competencies: {
                        connect: Array.from(familyCompetencyIds).map((id) => ({id})),
                    },
                },
            });
        }

        await tx.job.update({
            where: {id: job.id},
            data: {
                competenciesFamilies: {
                    connect: Array.from(familyIds).map((id) => ({id})),
                },
                competenciesSubfamilies: {
                    connect: Array.from(subFamilyIds).map((id) => ({id})),
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
                competenciesSubfamilies: true,
                competencies: true,
            },
        });
        return jobWithRelations;
    });
};

export const getJobDetailsByName = async (slug: string, lang: string = 'en') => {
    const job = await prisma.job.findUnique({
        where: {slug: slug},
        select: {id: true},
    });

    if (!job) return null;

    return await getJobDetails(job.id, lang);
}

export const savePositioningQuizzesForJob = async (payload: PositioningQuizImportPayload) => {
    const slug = payload.slug;

    return prisma.$transaction(async (tx) => {
        const job = await tx.job.findUnique(
            {where: {slug: slug}},
        );
        if (!job) {
            throw new Error(`Job not found: ${slug}`);
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
                competencySlugs.add(question.competencySlug);
            }
        }

        const competencies = competencySlugs.size
            ? await tx.competency.findMany({
                where: {jobs: {some: {id: job.id}}},
            })
            : [];

        const competencyMap = new Map<string, string>();
        competencies.forEach((c) => competencyMap.set(c.slug, c.id));

        const resolveCompetencyId = (slug: string): string | undefined => {
            return competencyMap.get(slug);
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
