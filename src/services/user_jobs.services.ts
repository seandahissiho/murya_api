import {
    Prisma,
    Quiz,
    QuizType,
    UserJobScope,
    UserJobStatus,
    UserQuiz,
    UserQuizStatus,
    JobProgressionLevel,
    QuizQuestionType,
    Level,
    LeagueTier,
    LearningResourceSource,
    CompetencyRating,
} from '@prisma/client';
import {prisma} from "../config/db";
import {resolveFields} from "../i18n/translate";
import {buildGenerateQuizInput} from "./quiz_gen/build-generate-quiz-input";
import {enqueueArticleGenerationJob, enqueueQuizGenerationJob, getRedisClient} from "../config/redis";
import {computeWaveformFromMediaUrl} from "../utils/waveform";
import {assignPositioningQuestsForUserJob, trackEvent} from "./quests.services";
import {realtimeBus} from "../realtime/realtimeBus";

const IRT_LEARNING_RATE = 0.1;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

const getEffectivePoints = (item: any, question: any) =>
    item.pointsOverride ?? question.defaultPoints ?? 0;

const getEffectiveTimeLimit = (item: any, question: any) =>
    item.timeLimitOverrideS ?? question.defaultTimeLimitS ?? 0;

const mapQuizItemsToQuestions = (quiz: any) => {
    const items = Array.isArray(quiz?.items) ? [...quiz.items] : [];
    items.sort((a, b) => a.index - b.index);
    return items.map((item) => {
        const question = item.question;
        return {
            ...question,
            index: item.index,
            points: getEffectivePoints(item, question),
            timeLimitInSeconds: getEffectiveTimeLimit(item, question),
            quizItemId: {quizId: item.quizId, questionId: item.questionId},
        };
    });
};

const buildServiceError = (message: string, statusCode: number) => {
    const error = new Error(message) as Error & {statusCode?: number};
    error.statusCode = statusCode;
    return error;
};

const STREAK_BONUS_BY_COUNT = new Map<number, number>([
    [2, 20],
    [3, 50],
    [4, 90],
    [5, 140],
    [6, 200],
    [7, 270],
    [8, 350],
    [9, 440],
    [10, 540],
]);

const getStreakBonus = (streak: number): number => {
    if (streak < 2) {
        return 0;
    }
    if (streak >= 10) {
        return 540;
    }
    return STREAK_BONUS_BY_COUNT.get(streak) ?? 0;
};

const getMaxStreakBonus = (questionCount: number): number => {
    let total = 0;
    for (let i = 1; i <= questionCount; i += 1) {
        total += getStreakBonus(i);
    }
    return total;
};

async function resolveJobOrFamilyId(targetId: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId);
    if (!isUuid) {
        throw new Error('Invalid job or job family id');
    }

    const job = await prisma.job.findUnique({
        where: {id: targetId},
        select: {id: true},
    });
    if (job) {
        return {scope: UserJobScope.JOB, jobId: job.id, jobFamilyId: null};
    }

    const jobFamily = await prisma.jobFamily.findUnique({
        where: {id: targetId},
        select: {id: true},
    });
    if (jobFamily) {
        return {scope: UserJobScope.JOB_FAMILY, jobId: null, jobFamilyId: jobFamily.id};
    }

    throw new Error('Job not found');
}

async function ensureUserJobFamilyTrack(userId: string, jobFamilyId: string) {
    const jobFamily = await prisma.jobFamily.findUnique({
        where: {id: jobFamilyId},
        include: {jobs: {select: {id: true}}},
    });
    if (!jobFamily) {
        throw new Error('JobFamily not found');
    }
    if (!jobFamily.jobs.length) {
        throw new Error('JobFamily has no jobs');
    }

    const existing = await prisma.userJob.findUnique({
        where: {userId_jobFamilyId: {userId, jobFamilyId}},
        select: {id: true},
    });

    const userJob = existing ?? await prisma.userJob.create({
        data: {
            userId,
            scope: UserJobScope.JOB_FAMILY,
            jobId: null,
            jobFamilyId,
            status: UserJobStatus.TARGET,
        },
        select: {id: true},
    });

    const familyJobIds = jobFamily.jobs.map((job) => job.id);
    const existingSelections = await prisma.userJobSelectedJob.findMany({
        where: {
            userJobId: userJob.id,
            jobId: {in: familyJobIds},
        },
        select: {jobId: true},
    });
    const existingIds = new Set(existingSelections.map((selection) => selection.jobId));
    const selectionsToCreate = familyJobIds
        .filter((jobId) => !existingIds.has(jobId))
        .map((jobId) => ({
            userJobId: userJob.id,
            jobId,
            isSelected: true,
        }));

    if (selectionsToCreate.length) {
        await prisma.userJobSelectedJob.createMany({
            data: selectionsToCreate,
            skipDuplicates: true,
        });
    }

    if (!existing) {
        await assignPositioningQuestsForUserJob(userJob.id);
    }

    return userJob;
}

async function localizeQuizContent(quiz: any, lang: string) {
    if (!quiz) return quiz;

    const localizedQuiz = await resolveFields({
        entity: 'Quiz',
        entityId: quiz.id,
        fields: ['title', 'description'],
        lang,
        base: {title: quiz.title, description: quiz.description},
    });

    const derivedQuestions = mapQuizItemsToQuestions(quiz);
    const questions = await Promise.all(
        derivedQuestions.map(async (q: any) => {
            const localizedQuestion = await resolveFields({
                entity: 'QuizQuestion',
                entityId: q.id,
                fields: ['text'],
                lang,
                base: {text: q.text},
            });

            const localizedCompetency = q.competency
                ? await resolveFields({
                    entity: 'Competency',
                    entityId: q.competency.id,
                    fields: ['name', 'description'],
                    lang,
                    base: q.competency,
                })
                : undefined;

            const responses = await Promise.all(
                (q.responses ?? []).map(async (r: any) => {
                    const localizedResponse = await resolveFields({
                        entity: 'QuizResponse',
                        entityId: r.id,
                        fields: ['text'],
                        lang,
                        base: {text: r.text},
                    });
                    return {...r, ...localizedResponse};
                })
            );

            return {...q, ...localizedQuestion, competency: localizedCompetency, responses};
        })
    );

    return {...quiz, ...localizedQuiz, questions};
}

async function getTopCompetencyFamilyIdsForJobs(jobIds: string[], limit = 5) {
    if (!jobIds.length) return [];
    const jobs = await prisma.job.findMany({
        where: {id: {in: jobIds}},
        select: {competenciesFamilies: {select: {id: true}}},
    });
    const familyCounts = new Map<string, number>();
    jobs.forEach((job) => {
        job.competenciesFamilies.forEach((family) => {
            familyCounts.set(family.id, (familyCounts.get(family.id) ?? 0) + 1);
        });
    });
    return Array.from(familyCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([familyId]) => familyId);
}

async function buildFamilyKiviatsForJobs(
    jobIds: string[],
    familyIds: string[],
    lang: string,
    jobFamily: {id: string; name: string; slug: string} | null,
) {
    if (!jobIds.length || !familyIds.length) return [];

    const families = await prisma.competenciesFamily.findMany({
        where: {id: {in: familyIds}},
        select: {id: true, name: true, slug: true, description: true},
        orderBy: {slug: 'asc'},
    });

    const localizedFamilies = await Promise.all(
        families.map(async (family) => {
            const loc = await resolveFields({
                entity: 'CompetenciesFamily',
                entityId: family.id,
                fields: ['name', 'description'],
                lang,
                base: family,
            });
            return {id: family.id, name: loc.name, slug: family.slug};
        })
    );

    const jobKiviats = await prisma.jobKiviat.findMany({
        where: {
            jobId: {in: jobIds},
            competenciesFamilyId: {in: familyIds},
        },
        select: {
            jobId: true,
            competenciesFamilyId: true,
            level: true,
            radarScore0to5: true,
        },
    });

    const levels = [
        JobProgressionLevel.JUNIOR,
        JobProgressionLevel.MIDLEVEL,
        JobProgressionLevel.SENIOR,
        JobProgressionLevel.EXPERT,
    ];

    const entries: Array<{
        id: string;
        jobId: string | null;
        jobFamilyId: string | null;
        userJobId: string | null;
        competenciesFamily: {id: string; name: string; slug: string};
        competenciesFamilyId: string;
        level: JobProgressionLevel;
        rawScore0to10: number;
        radarScore0to5: number;
        continuous0to10: number;
        masteryAvg0to1: number;
        jobFamily: {id: string; name: string; slug: string} | null;
    }> = [];

    for (const family of localizedFamilies) {
        for (const level of levels) {
            const values = jobKiviats
                .filter((k) => k.competenciesFamilyId === family.id && k.level === level)
                .map((k) => Number(k.radarScore0to5));
            const radarScore0to5 = values.length
                ? values.reduce((sum, v) => sum + v, 0) / values.length
                : 0;
            const continuous0to10 = radarScore0to5 * 2;

            entries.push({
                id: `${family.id}:${level}`,
                jobId: null,
                jobFamilyId: jobFamily?.id ?? null,
                userJobId: null,
                competenciesFamily: family,
                competenciesFamilyId: family.id,
                level,
                rawScore0to10: continuous0to10,
                radarScore0to5,
                continuous0to10,
                masteryAvg0to1: continuous0to10 / 10,
                jobFamily,
            });
        }
    }

    return entries;
}

const isSameDay = (a: Date, b: Date) => {
    return a.getUTCFullYear() === b.getUTCFullYear()
        && a.getUTCMonth() === b.getUTCMonth()
        && a.getUTCDate() === b.getUTCDate();
};

// getCurrentUserJob
export async function getCurrentUserJob(userId: any, lang: string = 'en') {
    const userJob = await prisma.userJob.findFirst({
        where: {userId, status: UserJobStatus.CURRENT},
        include: {
            job: {
                include: {
                    kiviats: {
                        include: {competenciesFamily: true},
                    },
                },
            },
            jobFamily: true,
            selectedJobs: {
                include: {
                    job: true,
                },
            },
            kiviats: {
                include: {
                    competenciesFamily: true,
                    histories: {orderBy: {createdAt: 'asc'}},
                },
            },
        },
    });

    if (!userJob) return null;

    const kiviats = await Promise.all(
        userJob.kiviats.map(async (k) => {
            const localizedFamily = await resolveFields({
                entity: 'CompetenciesFamily',
                entityId: k.competenciesFamily.id,
                fields: ['name', 'description'],
                lang,
                base: k.competenciesFamily,
            });
            return {...k, competenciesFamily: localizedFamily};
        })
    );

    if (userJob.scope === UserJobScope.JOB) {
        if (!userJob.job) {
            throw new Error('Job manquant pour un UserJob de scope JOB.');
        }

        const localizedJob = await resolveFields({
            entity: 'Job',
            entityId: userJob.job.id,
            fields: ['title', 'description'],
            lang,
            base: userJob.job,
        });

        const localizedJobKiviats = await Promise.all(
            (userJob.job.kiviats ?? []).map(async (k) => {
                const localizedFamily = await resolveFields({
                    entity: 'CompetenciesFamily',
                    entityId: k.competenciesFamily.id,
                    fields: ['name', 'description'],
                    lang,
                    base: k.competenciesFamily,
                });
                const localizedKiviat = await resolveFields({
                    entity: 'JobKiviat',
                    entityId: k.id,
                    fields: ['level'],
                    lang,
                    base: k,
                });
                return {...k, ...localizedKiviat, competenciesFamily: localizedFamily};
            })
        );

        return {...userJob, job: {...localizedJob, kiviats: localizedJobKiviats}, kiviats};
    }

    if (!userJob.jobFamily) {
        throw new Error('JobFamily manquante pour un UserJob de scope JOB_FAMILY.');
    }
    const jobFamily = userJob.jobFamily;

    const localizedJobFamily = await resolveFields({
        entity: 'JobFamily',
        entityId: jobFamily.id,
        fields: ['name'],
        lang,
        base: jobFamily,
    }) as typeof jobFamily;

    const selectedJobs = await Promise.all(
        userJob.selectedJobs.map(async (selection) => {
            const localizedJob = await resolveFields({
                entity: 'Job',
                entityId: selection.job.id,
                fields: ['title', 'description'],
                lang,
                base: selection.job,
            });
            return {
                ...selection,
                job: localizedJob,
            };
        })
    );

    const activeSelectedJobIds = selectedJobs
        .filter((selection) => selection.isSelected)
        .map((selection) => selection.job.id);

    const topFamilyIds = await getTopCompetencyFamilyIdsForJobs(activeSelectedJobIds, 5);
    const filteredKiviats = kiviats.filter((k) =>
        topFamilyIds.includes(k.competenciesFamily.id)
    );
    const jobFamilyKiviats = await buildFamilyKiviatsForJobs(
        activeSelectedJobIds,
        topFamilyIds,
        lang,
        localizedJobFamily
    );

    return {
        ...userJob,
        job: null,
        jobFamily: {...localizedJobFamily, kiviats: jobFamilyKiviats},
        selectedJobs,
        kiviats: filteredKiviats,
    };
}

export async function setCurrentUserJob(userId: string, jobId: string, lang: string = 'en') {
    const resolved = await resolveJobOrFamilyId(jobId);
    if (resolved.scope === UserJobScope.JOB_FAMILY) {
        return await setCurrentUserJobFamily(userId, resolved.jobFamilyId!, lang);
    }

    let created = false;
    const userJobId = await prisma.$transaction(async (tx) => {
        let userJob = await tx.userJob.findUnique({
            where: {userId_jobId: {userId, jobId}},
            select: {id: true, status: true},
        });

        if (!userJob) {
            userJob = await tx.userJob.create({
                data: {userId, jobId, scope: UserJobScope.JOB, jobFamilyId: null, status: UserJobStatus.CURRENT},
                select: {id: true, status: true},
            });
            created = true;
        } else if (userJob.status !== UserJobStatus.CURRENT) {
            await tx.userJob.update({
                where: {id: userJob.id},
                data: {status: UserJobStatus.CURRENT, scope: UserJobScope.JOB, jobFamilyId: null},
            });
        }

        await tx.userJob.updateMany({
            where: {
                userId,
                status: UserJobStatus.CURRENT,
                id: {not: userJob.id},
            },
            data: {status: UserJobStatus.PAST},
        });

        return userJob.id;
    });

    if (created) {
        await createUserQuizzesForJob(userJobId, jobId, userId);
        await assignPositioningQuestsForUserJob(userJobId);
    }

    return await getCurrentUserJob(userId, lang);
}

export async function setCurrentUserJobFamily(userId: string, jobFamilyId: string, lang: string = 'en') {
    const jobFamily = await prisma.jobFamily.findUnique({
        where: {id: jobFamilyId},
        include: {jobs: {select: {id: true}}},
    });
    if (!jobFamily) {
        throw new Error('JobFamily not found');
    }
    if (!jobFamily.jobs.length) {
        throw new Error('JobFamily has no jobs');
    }

    let created = false;
    const userJobId = await prisma.$transaction(async (tx) => {
        let userJob = await tx.userJob.findUnique({
            where: {userId_jobFamilyId: {userId, jobFamilyId}},
            select: {id: true, status: true, scope: true},
        });

        if (!userJob) {
            userJob = await tx.userJob.create({
                data: {
                    userId,
                    scope: UserJobScope.JOB_FAMILY,
                    jobId: null,
                    jobFamilyId,
                    status: UserJobStatus.CURRENT,
                },
                select: {id: true, status: true, scope: true},
            });
            created = true;
        } else if (userJob.status !== UserJobStatus.CURRENT || userJob.scope !== UserJobScope.JOB_FAMILY) {
            await tx.userJob.update({
                where: {id: userJob.id},
                data: {status: UserJobStatus.CURRENT, scope: UserJobScope.JOB_FAMILY, jobId: null},
            });
        }

        await tx.userJob.updateMany({
            where: {
                userId,
                status: UserJobStatus.CURRENT,
                id: {not: userJob.id},
            },
            data: {status: UserJobStatus.PAST},
        });

        const familyJobIds = jobFamily.jobs.map((job) => job.id);
        const existingSelections = await tx.userJobSelectedJob.findMany({
            where: {
                userJobId: userJob.id,
                jobId: {in: familyJobIds},
            },
            select: {jobId: true},
        });
        const existingIds = new Set(existingSelections.map((selection) => selection.jobId));
        const selectionsToCreate = familyJobIds
            .filter((jobId) => !existingIds.has(jobId))
            .map((jobId) => ({
                userJobId: userJob.id,
                jobId,
                isSelected: true,
            }));

        if (selectionsToCreate.length) {
            await tx.userJobSelectedJob.createMany({
                data: selectionsToCreate,
                skipDuplicates: true,
            });
        }

        return userJob.id;
    });

    if (created) {
        await assignPositioningQuestsForUserJob(userJobId);
    }

    return await getCurrentUserJob(userId, lang);
}

export async function updateUserJobFamilySelection(userJobId: string, selectedJobIds: string[]) {
    const uniqueSelectedIds = Array.from(new Set(selectedJobIds));
    if (!uniqueSelectedIds.length) {
        throw new Error('Au moins un métier doit rester sélectionné.');
    }

    const userJob = await prisma.userJob.findUnique({
        where: {id: userJobId},
        select: {id: true, scope: true, jobFamilyId: true},
    });
    if (!userJob) {
        throw new Error('UserJob not found');
    }
    if (userJob.scope !== UserJobScope.JOB_FAMILY || !userJob.jobFamilyId) {
        throw new Error('UserJob is not a job family track');
    }

    const familyJobs = await prisma.job.findMany({
        where: {jobFamilyId: userJob.jobFamilyId},
        select: {id: true},
    });
    if (!familyJobs.length) {
        throw new Error('JobFamily has no jobs');
    }

    const familyJobIds = familyJobs.map((job) => job.id);
    const familyJobIdSet = new Set(familyJobIds);
    for (const jobId of uniqueSelectedIds) {
        if (!familyJobIdSet.has(jobId)) {
            throw new Error('Un ou plusieurs métiers ne font pas partie de la famille.');
        }
    }

    await prisma.$transaction(async (tx) => {
        const existingSelections = await tx.userJobSelectedJob.findMany({
            where: {
                userJobId,
                jobId: {in: familyJobIds},
            },
            select: {jobId: true},
        });
        const existingIds = new Set(existingSelections.map((selection) => selection.jobId));
        const selectionsToCreate = familyJobIds
            .filter((jobId) => !existingIds.has(jobId))
            .map((jobId) => ({
                userJobId,
                jobId,
                isSelected: uniqueSelectedIds.includes(jobId),
            }));

        if (selectionsToCreate.length) {
            await tx.userJobSelectedJob.createMany({
                data: selectionsToCreate,
                skipDuplicates: true,
            });
        }

        await tx.userJobSelectedJob.updateMany({
            where: {userJobId, jobId: {in: familyJobIds}},
            data: {isSelected: false},
        });

        await tx.userJobSelectedJob.updateMany({
            where: {userJobId, jobId: {in: uniqueSelectedIds}},
            data: {isSelected: true},
        });
    });

    return prisma.userJobSelectedJob.findMany({
        where: {userJobId},
        include: {job: true},
    });
}

export async function getUserJob(jobId: string, userId: any, lang: string = 'en') {
    const resolved = await resolveJobOrFamilyId(jobId);

    if (resolved.scope === UserJobScope.JOB_FAMILY) {
        const userJob = await prisma.userJob.findUnique({
            where: {userId_jobFamilyId: {userId, jobFamilyId: resolved.jobFamilyId!}},
            include: {
                jobFamily: true,
                selectedJobs: {include: {job: true}},
            },
        });

        if (!userJob) {
            throw new Error('UserJob not found');
        }
        if (!userJob.jobFamily) {
            throw new Error('JobFamily manquante pour ce UserJob.');
        }
        const jobFamily = userJob.jobFamily;

        const localizedJobFamily = await resolveFields({
            entity: 'JobFamily',
            entityId: jobFamily.id,
            fields: ['name'],
            lang,
            base: jobFamily,
        }) as typeof jobFamily;

        const selectedJobs = await Promise.all(
            userJob.selectedJobs.map(async (selection) => {
                const localizedJob = await resolveFields({
                    entity: 'Job',
                    entityId: selection.job.id,
                    fields: ['title', 'description'],
                    lang,
                    base: selection.job,
                });
                return {
                    ...selection,
                    job: localizedJob,
                };
            })
        );

        return {
            ...userJob,
            job: null,
            jobFamily: localizedJobFamily,
            selectedJobs,
        };
    }

    const userJob = await prisma.userJob.findUnique({
        where: {userId_jobId: {userId, jobId: resolved.jobId!}},
        include: {
            job: true,
        },
    });

    if (!userJob) {
        throw new Error('UserJob not found');
    }
    if (!userJob.job) {
        throw new Error('Job manquant pour ce UserJob.');
    }

    const localizedJob = await resolveFields({
        entity: 'Job',
        entityId: userJob.job.id,
        fields: ['title', 'description'],
        lang,
        base: userJob.job,
    });

    return {...userJob, job: localizedJob};
}


export const retrievePositioningQuizForJob = async (userJob: any, lang: string = 'en'): Promise<Quiz> => {
    if (!userJob.jobId) {
        throw new Error('Job manquant pour la récupération du quiz de positionnement');
    }
    const userJobUpToDate = await prisma.userJob.findUnique({
        where: {id: userJob.id},
        select: {
            id: true,
            quizzes: {
                where: {type: QuizType.POSITIONING, isActive: true},
                include: {}
            },
        },
    });
    if (!userJobUpToDate) {
        throw new Error('Job not found');
    }
    let quizzes: any = userJobUpToDate.quizzes || [];

    if (quizzes.length === 0) {
        await createUserQuizzesForJob(userJob.id, userJob.jobId, userJob.userId);
        quizzes = await prisma.userQuiz.findMany({
            where: {userJobId: userJob.id, type: QuizType.POSITIONING, isActive: true},
            select: {quizId: true, index: true},
        });
    }


    // const quizzes = job.q || [];

    const completionCount = await prisma.userQuiz.count({
        where: {userJobId: userJob.id, status: UserQuizStatus.COMPLETED, type: QuizType.POSITIONING},
    });
    const currentIndex = (completionCount || userJob.completedQuizzes || 0);
    if (currentIndex >= quizzes.length) {
        throw new Error('No more positioning quizzes available for this job');
    }

    const positioningQuiz = quizzes.find((q: any) => q.index === currentIndex);

    if (!positioningQuiz) {
        throw new Error('Positioning quiz not found for the current index');
    }

    const quiz = await prisma.quiz.findUnique({
        where: {id: positioningQuiz.quizId},
        include: {
            items: {
                include: {
                    question: {
                        include: {
                            responses: {
                                include: {
                                    answerOptions: true,
                                },
                                orderBy: {index: 'asc'},
                            },
                            competency: true,
                        },
                    },
                },
                orderBy: {index: 'asc'},
            },
        }
    }) as any;

    return await localizeQuizContent(quiz, lang);
};

async function createUserQuizzesForJob(userJobId: string, jobId: string, userId: string) {
    const jobQuizzes = (await prisma.job.findUnique({
            where: {id: jobId},
            select: {
                quizzes: {
                    where: {type: QuizType.POSITIONING},
                    select: {
                        id: true,
                        items: {
                            select: {
                                pointsOverride: true,
                                question: {
                                    select: {
                                        defaultPoints: true,
                                    },
                                },
                            },
                        },
                    },
                    orderBy: {createdAt: 'asc'},
                }
            },
        }
    ))?.quizzes;
    if (!jobQuizzes || jobQuizzes.length === 0) {
        throw new Error('No quizzes available for this job');
    }

    // check if user has any assigned quizzes for this job
    let userQuizzes = await prisma.userQuiz.findMany({
        where: {userJobId: userJobId},
    });

    if (userQuizzes.length === 0) {
        // create the userQuiz entries
        let index = 0;
        for (const quiz of jobQuizzes) {
            const userQuiz = await prisma.userQuiz.create({
                data: {
                    userJobId: userJobId,
                    quizId: quiz.id,
                    type: QuizType.POSITIONING,
                    status: UserQuizStatus.ASSIGNED,
                    index: index++,
                    maxScore: quiz.items.reduce(
                        (sum, item) => sum + getEffectivePoints(item, item.question),
                        0,
                    ),
                }
            });
            userQuizzes.push(userQuiz);
        }
        // link the userQuizzes to userJob
        await prisma.userJob.update({
            where: {userId_jobId: {userId, jobId}},
            data: {
                quizzes: {
                    connect: userQuizzes.map((uq) => ({id: uq.id})),
                },
            },
            select: {quizzes: true, completedQuizzes: true, id: true},
        });
    }

}

async function createUserQuizzesForJobFamily(userJobId: string, jobFamilyId: string) {
    if (!jobFamilyId) {
        throw new Error('JobFamily manquante pour ce UserJob');
    }

    const existing = await prisma.userQuiz.findMany({
        where: {userJobId, type: QuizType.POSITIONING},
        select: {id: true},
    });
    if (existing.length) {
        return;
    }

    const quizzes = await prisma.quiz.findMany({
        where: {
            jobFamilyId,
            type: QuizType.POSITIONING,
            isActive: true,
        },
        include: {
            items: {
                select: {
                    pointsOverride: true,
                    question: {select: {defaultPoints: true}},
                },
            },
        },
        orderBy: {createdAt: 'asc'},
    });

    if (!quizzes.length || quizzes.length < 5) {
        throw new Error('Not enough positioning quizzes available for this job family');
    }

    let index = 0;
    const created = [];
    for (const quiz of quizzes) {
        const userQuiz = await prisma.userQuiz.create({
            data: {
                userJobId,
                quizId: quiz.id,
                type: QuizType.POSITIONING,
                status: UserQuizStatus.ASSIGNED,
                index: index++,
                maxScore: quiz.items.reduce(
                    (sum, item) => sum + getEffectivePoints(item, item.question),
                    0,
                ),
            },
        });
        created.push(userQuiz);
    }

    await prisma.userJob.update({
        where: {id: userJobId},
        data: {
            quizzes: {
                connect: created.map((uq) => ({id: uq.id})),
            },
        },
    });
}

// retrieveDailyQuizForJob
export const retrieveDailyQuizForJob = async (jobId: string, userId: string, lang: string = 'en'): Promise<Quiz | undefined | null> => {
    const resolved = await resolveJobOrFamilyId(jobId);

    if (resolved.scope === UserJobScope.JOB_FAMILY) {
        let userJob: any = await prisma.userJob.findUnique({
            where: {userId_jobFamilyId: {userId, jobFamilyId: resolved.jobFamilyId!}},
            select: {
                quizzes: true,
                id: true,
                userId: true,
                selectedJobs: {where: {isSelected: true}, select: {jobId: true}},
            },
        });
        if (!userJob) {
            const created = await ensureUserJobFamilyTrack(userId, resolved.jobFamilyId!);
            userJob = await prisma.userJob.findUnique({
                where: {id: created.id},
                select: {
                    quizzes: true,
                    id: true,
                    userId: true,
                    selectedJobs: {where: {isSelected: true}, select: {jobId: true}},
                },
            });
        }
        if (!userJob) {
            throw new Error('Failed to create userJob entry');
        }

        await createUserQuizzesForJobFamily(userJob.id, resolved.jobFamilyId!);

        const completionCount = await prisma.userQuiz.count({
            where: {userJobId: userJob.id, status: UserQuizStatus.COMPLETED, type: QuizType.POSITIONING},
        });
        const currentIndex = completionCount || 0;
        if (completionCount < 5) {
        const positioningQuiz = userJob.quizzes.find(
            (uq: UserQuiz) => uq.type === QuizType.POSITIONING && uq.index === currentIndex
        );
        if (!positioningQuiz) {
            const refreshed = await prisma.userJob.findUnique({
                where: {id: userJob.id},
                select: {quizzes: true},
            });
            const refreshedQuiz = refreshed?.quizzes.find(
                (uq: UserQuiz) => uq.type === QuizType.POSITIONING && uq.index === currentIndex
            );
            if (!refreshedQuiz) {
                throw new Error('Positioning quiz not found for the current index');
            }
            const quiz = await prisma.quiz.findUnique({
                where: {id: refreshedQuiz.quizId},
                include: {
                    items: {
                        include: {
                            question: {
                                include: {
                                    responses: {
                                        include: {answerOptions: true},
                                        orderBy: {index: 'asc'},
                                    },
                                    competency: true,
                                },
                            },
                        },
                        orderBy: {index: 'asc'},
                    },
                },
            });
            if (!quiz) {
                throw new Error('Positioning quiz not found');
            }
            return await localizeQuizContent(quiz, lang);
        }
        const quiz = await prisma.quiz.findUnique({
            where: {id: positioningQuiz.quizId},
            include: {
                    items: {
                        include: {
                            question: {
                                include: {
                                    responses: {
                                        include: {answerOptions: true},
                                        orderBy: {index: 'asc'},
                                    },
                                    competency: true,
                                },
                            },
                        },
                        orderBy: {index: 'asc'},
                    },
                },
            });
            if (!quiz) {
                throw new Error('Positioning quiz not found');
            }
            return await localizeQuizContent(quiz, lang);
        }

        const lastCompletedDaily = await prisma.userQuiz.findFirst({
            where: {
                userJobId: userJob.id,
                type: QuizType.DAILY,
                status: UserQuizStatus.COMPLETED,
                completedAt: {not: null},
            },
            orderBy: {completedAt: 'desc'},
            select: {completedAt: true},
        });

        if (lastCompletedDaily?.completedAt && isSameDay(lastCompletedDaily.completedAt, new Date())) {
            return null;
        }

        const dailyQuiz = userJob.quizzes.find(
            (uq: UserQuiz) => uq.type === QuizType.DAILY && uq.status === UserQuizStatus.ASSIGNED
        );
        if (!dailyQuiz) {
            const generated = await generateAdaptiveQuizForUserJob(userId, userJob.id);
            if (!generated) {
                return null;
            }
        }

        const refreshed = await prisma.userJob.findUnique({
            where: {id: userJob.id},
            select: {quizzes: true},
        });
        const assignedDaily = refreshed?.quizzes.find(
            (uq: UserQuiz) => uq.type === QuizType.DAILY && uq.status === UserQuizStatus.ASSIGNED
        );
        if (!assignedDaily) {
            return null;
        }

        const quiz = await prisma.quiz.findUnique({
            where: {id: assignedDaily.quizId},
            include: {
                items: {
                    include: {
                        question: {
                            include: {
                                responses: {
                                    include: {answerOptions: true},
                                    orderBy: {index: 'asc'},
                                },
                                competency: true,
                            },
                        },
                    },
                    orderBy: {index: 'asc'},
                },
            },
        });
        if (!quiz) {
            throw new Error('Daily quiz not found');
        }
        return await localizeQuizContent(quiz, lang);
    }

    // check if user has completed the positioning quiz for the job, if not, return then positioningQuiz
    let userJob: any = await prisma.userJob.findUnique({
        where: {userId_jobId: {userId, jobId: resolved.jobId!}},
        select: {quizzes: true, completedQuizzes: true, id: true, jobId: true, userId: true},
    });
    if (!userJob) {
        // create the userJob entry?
        userJob = await prisma.userJob.create({
            data: {userId, jobId: resolved.jobId!},
            select: {quizzes: true, completedQuizzes: true, id: true, jobId: true, userId: true},
        });
        if (!userJob) {
            throw new Error('Failed to create userJob entry');
        }

        await createUserQuizzesForJob(userJob.id, resolved.jobId!, userId);
    }

    const completionCount = await prisma.userQuiz.count({
        where: {userJobId: userJob.id, status: UserQuizStatus.COMPLETED, type: QuizType.POSITIONING},
        skip: 0,
    });
    const completedPositioningQuiz = completionCount >= 5;
    if (!completedPositioningQuiz) {
        return await retrievePositioningQuizForJob(userJob, lang);
    }

    // Bloquer un second DAILY le même jour
    const lastCompletedDaily = await prisma.userQuiz.findFirst({
        where: {
            userJobId: userJob.id,
            type: QuizType.DAILY,
            status: UserQuizStatus.COMPLETED,
            completedAt: {not: null},
        },
        orderBy: {completedAt: 'desc'},
        select: {completedAt: true},
    });

    if (lastCompletedDaily?.completedAt && isSameDay(lastCompletedDaily.completedAt, new Date())) {
        return null;
    }

    // If positioning quiz is completed, return the generated daily quiz for the job
    const dailyQuiz = userJob.quizzes.find(
        (uq: UserQuiz) => uq.type === QuizType.DAILY && uq.status === UserQuizStatus.ASSIGNED
    );
    if (!dailyQuiz) {
        return null;
    }
    const quiz = await prisma.quiz.findUnique({
        where: {id: dailyQuiz.quizId},
        include: {
            items: {
                include: {
                    question: {
                        include: {
                            responses: {
                                include: {answerOptions: true},
                                orderBy: {index: 'asc'},
                            },
                            competency: true,
                        },
                    },
                },
                orderBy: {index: 'asc'},
            },
        },
    });
    if (!quiz) {
        throw new Error('Daily quiz not found');
    }
    return await localizeQuizContent(quiz, lang);
}

type AnswerInput = {
    questionId: string;
    timeToAnswer: number;
    freeTextAnswer?: string;
    responseIds?: string[]; // ids de QuizResponse sélectionnées
};

async function updateUserJobStats(
    userJobId: string,
    doneAt: Date,
    client: Prisma.TransactionClient = prisma as unknown as Prisma.TransactionClient,
) {
    const userJobScope = await client.userJob.findUnique({
        where: {id: userJobId},
        select: {
            scope: true,
            selectedJobs: {where: {isSelected: true}, select: {jobId: true}},
        },
    });
    if (!userJobScope) {
        throw new Error('UserJob introuvable pour la mise à jour des stats.');
    }

    const selectedJobIds = new Set(
        userJobScope.selectedJobs?.map((selection: {jobId: string}) => selection.jobId) ?? []
    );

    // 5. Recalculer les agrégats sur UserJob
    const allQuizzes: Array<{
        status: UserQuizStatus;
        totalScore: number | null;
        maxScore: number | null;
        bonusPoints: number | null;
        maxScoreWithBonus: number;
        completedAt: Date | null;
        jobsSnapshot: unknown;
    }> = await client.userQuiz.findMany({
        where: {userJobId: userJobId},
        select: {
            status: true,
            totalScore: true,
            maxScore: true,
            bonusPoints: true,
            maxScoreWithBonus: true,
            completedAt: true,
            jobsSnapshot: true,
        },
    });

    const filteredQuizzes =
        userJobScope.scope === UserJobScope.JOB_FAMILY
            ? allQuizzes.filter((quiz) => {
                const snapshot = Array.isArray(quiz.jobsSnapshot) ? quiz.jobsSnapshot : [];
                if (!snapshot.length) {
                    return true;
                }
                return snapshot.some((jobId: unknown) => selectedJobIds.has(String(jobId)));
            })
            : allQuizzes;

    // const quizzesCount = filteredQuizzes.length;
    const completedQuizzes = filteredQuizzes.filter(
        (q) => q.status === UserQuizStatus.COMPLETED
    ).length;
    const totalScoreSum = filteredQuizzes.reduce(
        (sum: number, q) => {
            const total = (q.totalScore ?? 0) + (q.bonusPoints ?? 0);
            return sum + total;
        },
        0
    );
    const maxScoreSum = filteredQuizzes.reduce(
        (sum: number, q) => sum + q.maxScoreWithBonus,
        0,
    );

    // const lastQuizAt = allQuizzes.reduce<Date | null>((latest, q) => {
    //     if (!q.completedAt) return latest;
    //     if (!latest || q.completedAt > latest) return q.completedAt;
    //     return latest;
    // }, null);

    // lastQuizAt done now
    const lastQuizAt = doneAt;

    await client.userJob.update({
        where: {id: userJobId},
        data: {
            // quizzesCount,
            completedQuizzes,
            totalScore: totalScoreSum,
            maxScoreSum,
            lastQuizAt,
            status: UserJobStatus.CURRENT,
        },
    });

    // set all other user's UserJob to PAST except the current one
    const currentUserJob = await client.userJob.findUnique({
        where: {id: userJobId},
        select: {userId: true},
    });
    await client.userJob.updateMany({
        where: {
            userId: currentUserJob?.userId,
            id: {not: userJobId},
            status: UserJobStatus.CURRENT,
        },
        data: {
            status: UserJobStatus.PAST,
        },
    });
}

type GeneratedQuizResponseDto = {
    text: string;
    isCorrect: boolean;
    index?: number;
    metadata?: any;
};

type GeneratedQuizQuestionDto = {
    text: string;
    competencySlug: string;
    difficulty?: string;
    type?: string;
    timeLimitInSeconds?: number;
    points?: number;
    mediaUrl?: string | null;
    metadata?: any;
    index?: number;
    responses: GeneratedQuizResponseDto[];
};

type GeneratedQuizDto = {
    title: string;
    description?: string;
    level?: string;
    questions: GeneratedQuizQuestionDto[];
};

const mapDifficultyToLevel = (difficulty?: string): Level => {
    const normalized = difficulty?.toUpperCase();
    if (normalized === 'EASY') return Level.EASY;
    if (normalized === 'MEDIUM') return Level.MEDIUM;
    if (normalized === 'HARD' || normalized === 'DIFFICULT') return Level.HARD;
    if (normalized === 'EXPERT') return Level.EXPERT;
    return Level.MEDIUM;
};

const mapQuestionType = (value?: string): QuizQuestionType => {
    switch ((value ?? '').toLowerCase()) {
        case 'multiple_choice':
        case 'multiple-choice':
            return QuizQuestionType.multiple_choice;
        case 'true_false':
        case 'true-false':
            return QuizQuestionType.true_false;
        case 'short_answer':
            return QuizQuestionType.short_answer;
        case 'fill_in_the_blank':
        case 'fill-in-the-blank':
            return QuizQuestionType.fill_in_the_blank;
        default:
            return QuizQuestionType.single_choice;
    }
};

const mapLeagueTierToProgressionLevel = (tier: LeagueTier | null | undefined): JobProgressionLevel => {
    switch (tier) {
        case LeagueTier.IRON:
        case LeagueTier.BRONZE:
            return JobProgressionLevel.JUNIOR;
        case LeagueTier.SILVER:
        case LeagueTier.GOLD:
            return JobProgressionLevel.MIDLEVEL;
        case LeagueTier.PLATINUM:
        case LeagueTier.EMERALD:
        case LeagueTier.DIAMOND:
            return JobProgressionLevel.SENIOR;
        case LeagueTier.MASTER:
        case LeagueTier.GRANDMASTER:
        case LeagueTier.CHALLENGER:
            return JobProgressionLevel.EXPERT;
        default:
            return JobProgressionLevel.MIDLEVEL;
    }
};

const getTargetForProgressionLevel = (
    targets: {junior: number; mid: number; senior: number} | undefined,
    level: JobProgressionLevel,
) => {
    if (!targets) return null;
    switch (level) {
        case JobProgressionLevel.JUNIOR:
            return targets.junior ?? null;
        case JobProgressionLevel.MIDLEVEL:
            return targets.mid ?? null;
        case JobProgressionLevel.SENIOR:
            return targets.senior ?? null;
        case JobProgressionLevel.EXPERT:
            return targets.senior ?? null;
        default:
            return null;
    }
};

const computeCompetencyRating = (masteryNow: number, targetScore0to5: number | null) => {
    const mastery = clamp(masteryNow ?? 0, 0, 1);
    if (targetScore0to5 && targetScore0to5 > 0) {
        const expected = clamp(targetScore0to5 / 5, 0.1, 0.95);
        const ratio = mastery / expected;
        if (ratio >= 1.2) return CompetencyRating.TRES_BON;
        if (ratio >= 1.0) return CompetencyRating.BON;
        if (ratio >= 0.85) return CompetencyRating.MOYEN;
        if (ratio >= 0.7) return CompetencyRating.MAUVAIS;
        return CompetencyRating.TRES_MAUVAIS;
    }
    if (mastery >= 0.85) return CompetencyRating.TRES_BON;
    if (mastery >= 0.7) return CompetencyRating.BON;
    if (mastery >= 0.55) return CompetencyRating.MOYEN;
    if (mastery >= 0.4) return CompetencyRating.MAUVAIS;
    return CompetencyRating.TRES_MAUVAIS;
};

export async function generateAndPersistDailyQuiz(userId: string, userJobId: string, jobId?: string) {
    const agentUrl = process.env.QUIZ_GENERATION_URL || process.env.QUIZ_AGENT_URL;
    if (!agentUrl) {
        throw new Error('QUIZ_GENERATION_URL (ou QUIZ_AGENT_URL) non configuré');
    }

    const existingAssigned = await prisma.userQuiz.findFirst({
        where: {userJobId, type: QuizType.DAILY, status: UserQuizStatus.ASSIGNED},
        select: {id: true},
    });
    if (existingAssigned) {
        return existingAssigned;
    }

    const userJob = await prisma.userJob.findUnique({
        where: {id: userJobId},
        include: {
            selectedJobs: true,
        },
    });
    if (!userJob) {
        throw new Error('UserJob introuvable pour la génération');
    }

    const activeJobIds =
        userJob.scope === UserJobScope.JOB
            ? userJob.jobId
                ? [userJob.jobId]
                : []
            : userJob.selectedJobs.filter((sj) => sj.isSelected).map((sj) => sj.jobId);

    if (!activeJobIds.length) {
        throw new Error('Aucun métier sélectionné pour la génération');
    }

    if (jobId && userJob.scope === UserJobScope.JOB && userJob.jobId !== jobId) {
        throw new Error('Le jobId ne correspond pas au UserJob demandé');
    }

    const payload = await buildGenerateQuizInput({
        userId,
        userJobId,
        selectedJobIds: userJob.scope === UserJobScope.JOB_FAMILY ? activeJobIds : undefined,
        generationParameters: {
            numberOfQuestions: 10,
            allowedQuestionTypes: [
                QuizQuestionType.single_choice,
            ],
            focusWeakCompetenciesRatio: 0.6,
            includeStrongForReviewRatio: 0.2,
            avoidQuestionIds: [],
            targetJobProgressionLevel: mapLeagueTierToProgressionLevel(userJob.leagueTier),
        },
    });

    const response = await fetch(`${agentUrl}/generate-quiz`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`Echec de génération de quiz (status ${response.status})`);
    }

    const body = await response.json();
    const generated: GeneratedQuizDto = body?.quiz ?? body;

    if (!generated || !generated.questions?.length) {
        throw new Error('Réponse de génération invalide (questions absentes)');
    }

    const jobIdsForQuiz = userJob.scope === UserJobScope.JOB ? [userJob.jobId!] : activeJobIds;
    const quizJobId = userJob.scope === UserJobScope.JOB ? userJob.jobId! : null;
    const quizJobFamilyId = userJob.scope === UserJobScope.JOB_FAMILY ? userJob.jobFamilyId : null;

    const jobsForCompetencies = await prisma.job.findMany({
        where: {id: {in: jobIdsForQuiz}},
        include: {competencies: true},
    });
    if (!jobsForCompetencies.length) {
        throw new Error('Jobs introuvables pour la génération');
    }

    const competencyMap = new Map<string, string>();
    jobsForCompetencies.forEach((j) => j.competencies.forEach((c) => competencyMap.set(c.slug, c.id)));

    const quiz = await prisma.quiz.create({
        data: {
            jobId: quizJobId,
            jobFamilyId: quizJobFamilyId,
            title: generated.title,
            description: generated.description ?? '',
            level: mapDifficultyToLevel(generated.level),
            type: QuizType.DAILY,
            items: {
                create: generated.questions.map((q, idx) => {
                    const competencyId = competencyMap.get(q.competencySlug);
                    if (!competencyId) {
                        throw new Error(`Compétence inconnue pour le slug "${q.competencySlug}"`);
                    }
                    const index = q.index ?? idx;
                    return {
                        index,
                        question: {
                            create: {
                                text: q.text,
                                competencyId,
                                defaultTimeLimitS: q.timeLimitInSeconds ?? 30,
                                defaultPoints: q.points ?? 1,
                                level: mapDifficultyToLevel(q.difficulty),
                                type: mapQuestionType(q.type),
                                mediaUrl: q.mediaUrl ?? '',
                                metadata: q.metadata ?? undefined,
                                responses: {
                                    create: q.responses.map((r, rIdx) => ({
                                        text: r.text,
                                        metadata: r.metadata ?? undefined,
                                        isCorrect: r.isCorrect,
                                        index: r.index ?? rIdx,
                                    })),
                                },
                            },
                        },
                    };
                }),
            },
        },
        include: {
            items: {
                include: {
                    question: {
                        include: {responses: true, competency: true},
                    },
                },
                orderBy: {index: 'asc'},
            },
        },
    });

    const maxIndex = await prisma.userQuiz.aggregate({
        _max: {index: true},
        where: {userJobId},
    });
    const nextIndex = (maxIndex._max.index ?? -1) + 1;

    const maxScore = quiz.items.reduce(
        (sum, item) => sum + getEffectivePoints(item, item.question),
        0,
    );
    const maxScoreWithBonus = maxScore;

    const userQuiz = await prisma.userQuiz.create({
        data: {
            userJobId,
            quizId: quiz.id,
            type: QuizType.DAILY,
            status: UserQuizStatus.ASSIGNED,
            index: nextIndex,
            maxScore,
            maxScoreWithBonus,
            jobsSnapshot: activeJobIds,
        },
        include: {
            quiz: {
                include: {
                    items: {
                        include: {
                            question: {
                                include: {
                                    responses: true,
                                    competency: true,
                                },
                            },
                        },
                        orderBy: {index: 'asc'},
                    },
                },
            },
        },
    });

    return userQuiz;
}

export async function generateAdaptiveQuizForUserJob(userId: string, userJobId: string, jobId?: string) {
    if (getRedisClient()) {
        try {
            const enqueued = await enqueueQuizGenerationJob({userId, jobId, userJobId});
            if (enqueued) {
                return null;
            }
        } catch (err) {
            console.error('Failed to enqueue quiz generation job, fallback to inline generation', err);
        }
    }

    return await generateAndPersistDailyQuiz(userId, userJobId, jobId);
}


async function generateNextQuiz(updatedUserQuiz: any, userJobId: string, userId: string, jobId: string) {
    let shouldGeneratePersonalizedQuiz = false;

    const pendingNextQuiz = await prisma.userQuiz.findFirst({
        where: {
            userJobId,
            isActive: true,
            status: UserQuizStatus.ASSIGNED,
            index: {gt: updatedUserQuiz.index},
        },
        orderBy: {index: 'asc'},
    });

    if (updatedUserQuiz.type === QuizType.POSITIONING) {
        const hasRemainingPositioningQuiz = await prisma.userQuiz.findFirst({
            where: {
                userJobId,
                type: QuizType.POSITIONING,
                isActive: true,
                status: UserQuizStatus.ASSIGNED,
                index: {gt: updatedUserQuiz.index},
            },
        });

        if (!hasRemainingPositioningQuiz && !pendingNextQuiz) {
            shouldGeneratePersonalizedQuiz = true;
        }
    } else {
        shouldGeneratePersonalizedQuiz = !pendingNextQuiz;
    }

    if (shouldGeneratePersonalizedQuiz) {
        try {
            await generateAdaptiveQuizForUserJob(userId, userJobId, jobId);
        } catch (e) {
            console.error('Failed to generate next quiz', e);
        }
    }

    return updatedUserQuiz;
}

export const saveQuizAnswersAndComplete = async (
    jobId: string,
    quizId: string,
    userId: string,
    answers: AnswerInput[],
    doneAt: string,
    timezone: string = 'UTC',
    lang: string = 'en',
) => {
    const completedAt = doneAt ? new Date(doneAt) : new Date();

    type ResolvedAnswer = {
        questionId: string;
        competencyId: string;
        item: any;
        question: any;
        points: number;
        isCorrect: boolean;
        score: number;
        timeToAnswer: number;
        responseIds: string[];
        freeTextAnswer: string | null;
    };

    const {
        updatedUserQuiz,
        userJob,
        wasAlreadyCompleted,
        radar,
        leagueTier,
        leaguePoints,
    } = await prisma.$transaction(async (tx: any) => {
        const quiz = await tx.quiz.findUnique({
            where: {id: quizId},
            include: {
                job: {select: {id: true}},
                jobFamily: {select: {id: true}},
                items: {
                    include: {
                        question: {
                            include: {
                                responses: true,
                                competency: {include: {families: true}},
                            },
                        },
                    },
                    orderBy: {index: 'asc'},
                },
            },
        });
        if (!quiz) {
            throw buildServiceError("Quiz introuvable.", 404);
        }
        if (!quiz.isActive) {
            throw buildServiceError("Quiz inactif.", 409);
        }

        const userJobs = await tx.userJob.findMany({
            where: {
                userId,
                OR: [{jobId}, {jobFamilyId: jobId}],
            },
            select: {
                id: true,
                scope: true,
                jobId: true,
                jobFamilyId: true,
                leagueTier: true,
                leaguePoints: true,
                createdAt: true,
                selectedJobs: {where: {isSelected: true}, select: {jobId: true}},
            },
        });
        if (!userJobs.length) {
            throw buildServiceError("Job introuvable pour cet utilisateur.", 404);
        }

        let candidates = userJobs;
        if (quiz.jobId) {
            candidates = candidates.filter((candidate: any) => candidate.jobId === quiz.jobId);
        }
        if (quiz.jobFamilyId) {
            candidates = candidates.filter((candidate: any) => candidate.jobFamilyId === quiz.jobFamilyId);
        }
        if (!candidates.length) {
            throw buildServiceError("Quiz non disponible dans ce scope utilisateur.", 404);
        }

        const candidateIds = candidates.map((candidate: any) => candidate.id);
        const userQuizzes = await tx.userQuiz.findMany({
            where: {
                quizId,
                userJobId: {in: candidateIds},
                isActive: true,
            },
            orderBy: {assignedAt: 'desc'},
        });
        if (!userQuizzes.length) {
            throw buildServiceError("Quiz non assigné à ce userJob.", 404);
        }

        let userQuiz = userQuizzes[0];
        if (userQuizzes.length > 1) {
            const pendingActive = userQuizzes.find(
                (uq: any) => uq.status !== UserQuizStatus.COMPLETED && uq.status !== UserQuizStatus.EXPIRED,
            );
            const pending = pendingActive ?? userQuizzes.find((uq: any) => uq.status !== UserQuizStatus.COMPLETED);
            if (pending) {
                userQuiz = pending;
            }
        }

        const resolvedUserJob = candidates.find((candidate: any) => candidate.id === userQuiz.userJobId);
        if (!resolvedUserJob) {
            throw buildServiceError("UserJob introuvable pour ce quiz.", 404);
        }

        await tx.$queryRaw`SELECT id FROM "UserQuiz" WHERE id = ${userQuiz.id}::uuid FOR UPDATE`;
        const lockedUserQuiz = await tx.userQuiz.findUnique({
            where: {id: userQuiz.id},
        });
        if (!lockedUserQuiz) {
            throw buildServiceError("Quiz introuvable pour cet utilisateur.", 404);
        }
        userQuiz = lockedUserQuiz;

        if (userQuiz.status === UserQuizStatus.EXPIRED) {
            throw buildServiceError("Quiz expiré.", 409);
        }

        if (userQuiz.status === UserQuizStatus.COMPLETED) {
            const existingRadar = await tx.userJobKiviat.findMany({
                where: {userJobId: resolvedUserJob.id},
            });
            return {
                updatedUserQuiz: userQuiz,
                userJob: resolvedUserJob,
                wasAlreadyCompleted: true,
                radar: existingRadar,
                leagueTier: resolvedUserJob.leagueTier,
                leaguePoints: resolvedUserJob.leaguePoints,
            };
        }

        if (!answers || !Array.isArray(answers) || answers.length === 0) {
            throw buildServiceError("Les réponses du quiz sont requises.", 400);
        }

        const items = [...quiz.items].sort((a: any, b: any) => a.index - b.index);
        const competencyFamilyIdsById = new Map<string, string[]>();
        for (const item of items) {
            const competency = item?.question?.competency;
            if (!competency?.id) continue;
            const familyIds = Array.isArray(competency.families)
                ? competency.families.map((family: any) => family.id)
                : [];
            if (familyIds.length) {
                competencyFamilyIdsById.set(competency.id, familyIds);
            }
        }
        const expectedQuestionIds = items.map((item: any) => item.questionId);
        const expectedSet = new Set(expectedQuestionIds);

        if (answers.length !== expectedQuestionIds.length) {
            throw buildServiceError("Le nombre de réponses ne correspond pas au quiz.", 400);
        }

        const payloadQuestionIds = answers.map((answer) => answer.questionId);
        const payloadSet = new Set(payloadQuestionIds);
        if (payloadSet.size !== payloadQuestionIds.length) {
            throw buildServiceError("Le payload contient des questionId dupliqués.", 400);
        }
        if (payloadSet.size !== expectedSet.size || !payloadQuestionIds.every((id) => expectedSet.has(id))) {
            throw buildServiceError("Les questions ne correspondent pas au quiz.", 400);
        }

        const itemByQuestionId = new Map(items.map((item: any) => [item.questionId, item]));

        for (const answer of answers) {
            const item = itemByQuestionId.get(answer.questionId);
            if (!item) {
                throw buildServiceError(`Question inconnue: ${answer.questionId}`, 400);
            }
            const question = item.question;
            const responseIds = Array.isArray(answer.responseIds) ? answer.responseIds : [];
            const freeTextAnswer = typeof answer.freeTextAnswer === 'string' ? answer.freeTextAnswer.trim() : '';

            if (typeof answer.timeToAnswer !== 'number') {
                throw buildServiceError(`timeToAnswer invalide pour la question ${answer.questionId}`, 400);
            }

            if (question.type === QuizQuestionType.single_choice || question.type === QuizQuestionType.true_false) {
                if (responseIds.length !== 1) {
                    throw buildServiceError(`Réponse invalide pour la question ${answer.questionId}`, 400);
                }
            } else if (question.type === QuizQuestionType.multiple_choice) {
                if (responseIds.length < 1) {
                    throw buildServiceError(`Réponse invalide pour la question ${answer.questionId}`, 400);
                }
            } else if (
                question.type === QuizQuestionType.short_answer
                || question.type === QuizQuestionType.fill_in_the_blank
            ) {
                if (!freeTextAnswer) {
                    throw buildServiceError(`Réponse texte manquante pour la question ${answer.questionId}`, 400);
                }
            }

            if (
                question.type === QuizQuestionType.single_choice
                || question.type === QuizQuestionType.multiple_choice
                || question.type === QuizQuestionType.true_false
            ) {
                const validResponseIds = new Set((question.responses ?? []).map((r: any) => r.id));
                for (const responseId of responseIds) {
                    if (!validResponseIds.has(responseId)) {
                        throw buildServiceError(`Réponse invalide pour la question ${answer.questionId}`, 400);
                    }
                }
            }
        }

        const existingAnswers = await tx.userQuizAnswer.findMany({
            where: {userQuizId: userQuiz.id},
            include: {options: true},
        });
        const existingQuestionIds = new Set(existingAnswers.map((answer: any) => answer.questionId));
        const hasFullExistingAnswers =
            existingAnswers.length === expectedQuestionIds.length
            && expectedQuestionIds.every((id) => existingQuestionIds.has(id));

        if (!hasFullExistingAnswers && existingAnswers.length) {
            await tx.userQuizAnswerOption.deleteMany({
                where: {userQuizAnswerId: {in: existingAnswers.map((answer: any) => answer.id)}},
            });
            await tx.userQuizAnswer.deleteMany({
                where: {userQuizId: userQuiz.id},
            });
        }

        const resolvedAnswers: ResolvedAnswer[] = [];
        const resolvedByQuestionId = new Map<string, ResolvedAnswer>();

        if (hasFullExistingAnswers) {
            for (const answer of existingAnswers) {
                const item = itemByQuestionId.get(answer.questionId);
                if (!item) {
                    throw buildServiceError(`Réponse hors quiz: ${answer.questionId}`, 400);
                }
                const question = item.question;
                const points = getEffectivePoints(item, question);
                const resolved: ResolvedAnswer = {
                    questionId: answer.questionId,
                    competencyId: question.competencyId,
                    item,
                    question,
                    points,
                    isCorrect: Boolean(answer.isCorrect),
                    score: Number(answer.score ?? 0),
                    timeToAnswer: Number(answer.timeToAnswer ?? 0),
                    responseIds: (answer.options ?? []).map((option: any) => option.responseId),
                    freeTextAnswer: answer.freeTextAnswer ?? null,
                };
                resolvedAnswers.push(resolved);
                resolvedByQuestionId.set(resolved.questionId, resolved);
            }
        } else {
            for (const rawAnswer of answers) {
                const item = itemByQuestionId.get(rawAnswer.questionId);
                if (!item) {
                    throw buildServiceError(`Question inconnue: ${rawAnswer.questionId}`, 400);
                }
                const question = item.question;
                const responseIds = Array.isArray(rawAnswer.responseIds) ? rawAnswer.responseIds : [];
                const freeTextAnswer = typeof rawAnswer.freeTextAnswer === 'string' ? rawAnswer.freeTextAnswer.trim() : '';
                const points = getEffectivePoints(item, question);

                let isCorrect = false;

                if (
                    question.type === QuizQuestionType.single_choice
                    || question.type === QuizQuestionType.true_false
                ) {
                    const selected = question.responses.find((r: any) => r.id === responseIds[0]);
                    isCorrect = Boolean(selected?.isCorrect);
                } else if (question.type === QuizQuestionType.multiple_choice) {
                    const correctIds = question.responses.filter((r: any) => r.isCorrect).map((r: any) => r.id);
                    const selectedSet = new Set(responseIds);
                    const correctSet = new Set(correctIds);
                    isCorrect = selectedSet.size === correctSet.size
                        && correctIds.every((id: string) => selectedSet.has(id));
                } else if (
                    question.type === QuizQuestionType.short_answer
                    || question.type === QuizQuestionType.fill_in_the_blank
                ) {
                    const accepted = Array.isArray(question.metadata?.acceptedAnswers)
                        ? question.metadata.acceptedAnswers
                        : [];
                    const normalized = freeTextAnswer.toLowerCase();
                    const acceptedNormalized = accepted.map((value: string) => value.trim().toLowerCase());
                    isCorrect = acceptedNormalized.includes(normalized);
                }

                const score = isCorrect ? points : 0;
                const resolved: ResolvedAnswer = {
                    questionId: question.id,
                    competencyId: question.competencyId,
                    item,
                    question,
                    points,
                    isCorrect,
                    score,
                    timeToAnswer: Number(rawAnswer.timeToAnswer ?? 0),
                    responseIds,
                    freeTextAnswer: freeTextAnswer || null,
                };
                resolvedAnswers.push(resolved);
                resolvedByQuestionId.set(resolved.questionId, resolved);
            }

            for (const resolved of resolvedAnswers) {
                const createdAnswer = await tx.userQuizAnswer.create({
                    data: {
                        userQuizId: userQuiz.id,
                        questionId: resolved.questionId,
                        timeToAnswer: resolved.timeToAnswer ?? 0,
                        freeTextAnswer: resolved.freeTextAnswer,
                        isCorrect: resolved.isCorrect,
                        score: resolved.score,
                    },
                });

                if (resolved.responseIds.length > 0) {
                    await tx.userQuizAnswerOption.createMany({
                        data: resolved.responseIds.map((responseId) => ({
                            userQuizAnswerId: createdAnswer.id,
                            responseId,
                        })),
                    });
                }
            }
        }

        const maxScore = items.reduce(
            (sum: number, item: any) => sum + getEffectivePoints(item, item.question),
            0,
        );
        const maxTimeBonus = items.reduce(
            (sum: number, item: any) => sum + getEffectiveTimeLimit(item, item.question),
            0,
        );
        const maxScoreWithBonus = maxScore + maxTimeBonus + getMaxStreakBonus(items.length);

        const totalScore = resolvedAnswers.reduce((sum, answer) => sum + answer.score, 0);
        let bonusPoints = 0;
        let streak = 0;
        for (const item of items) {
            const resolved = resolvedByQuestionId.get(item.questionId);
            if (!resolved) {
                continue;
            }
            if (resolved.isCorrect) {
                streak += 1;
                const timeLimit = getEffectiveTimeLimit(item, resolved.question);
                const timeBonus = timeLimit - resolved.timeToAnswer;
                bonusPoints += timeBonus + getStreakBonus(streak);
            } else {
                streak = 0;
            }
        }

        const percentage = maxScoreWithBonus > 0
            ? ((totalScore + bonusPoints) / maxScoreWithBonus) * 100
            : 0;

        let effectiveJobIds: string[] = [];
        if (resolvedUserJob.scope === UserJobScope.JOB_FAMILY) {
            const snapshotIds = Array.isArray(userQuiz.jobsSnapshot)
                ? userQuiz.jobsSnapshot.map((id: any) => String(id))
                : [];
            if (snapshotIds.length) {
                effectiveJobIds = snapshotIds;
            } else if (resolvedUserJob.selectedJobs?.length) {
                effectiveJobIds = resolvedUserJob.selectedJobs.map((selection: any) => selection.jobId);
            } else if (resolvedUserJob.jobFamilyId) {
                const family = await tx.jobFamily.findUnique({
                    where: {id: resolvedUserJob.jobFamilyId},
                    select: {jobs: {select: {id: true}}},
                });
                effectiveJobIds = family?.jobs.map((job: any) => job.id) ?? [];
            }
        }

        const userQuizUpdateData: any = {
            totalScore,
            maxScore,
            bonusPoints,
            maxScoreWithBonus,
            percentage,
            status: UserQuizStatus.COMPLETED,
            completedAt: completedAt,
            startedAt: userQuiz.startedAt ?? completedAt,
        };
        if (effectiveJobIds.length && (!Array.isArray(userQuiz.jobsSnapshot) || userQuiz.jobsSnapshot.length === 0)) {
            userQuizUpdateData.jobsSnapshot = effectiveJobIds;
        }

        const updatedUserQuiz = await tx.userQuiz.update({
            where: {id: userQuiz.id},
            data: userQuizUpdateData,
        });

        await tx.user.update({
            where: {id: userId},
            data: {
                diamonds: {
                    increment: totalScore + bonusPoints,
                },
            },
        });

        const competencyAgg = new Map<
            string,
            {
                scorePoints: number;
                maxPoints: number;
                correctCount: number;
                totalCount: number;
                totalTime: number;
                sumB: number;
                itemCount: number;
            }
        >();

        for (const resolved of resolvedAnswers) {
            const agg = competencyAgg.get(resolved.competencyId) ?? {
                scorePoints: 0,
                maxPoints: 0,
                correctCount: 0,
                totalCount: 0,
                totalTime: 0,
                sumB: 0,
                itemCount: 0,
            };
            agg.scorePoints += resolved.score;
            agg.maxPoints += resolved.points;
            agg.correctCount += resolved.isCorrect ? 1 : 0;
            agg.totalCount += 1;
            agg.totalTime += resolved.timeToAnswer;
            agg.sumB += Number(resolved.question.irtB ?? 0);
            agg.itemCount += 1;
            competencyAgg.set(resolved.competencyId, agg);
        }

        const competencyIds = Array.from(competencyAgg.keys());
        if (!competencyIds.length) {
            throw buildServiceError("Aucune compétence trouvée pour ce quiz.", 400);
        }

        const existingUjcs = await tx.userJobCompetency.findMany({
            where: {
                userJobId: resolvedUserJob.id,
                competencyId: {in: competencyIds},
            },
        });
        const existingUjcIds = new Set(existingUjcs.map((ujc: any) => ujc.competencyId));
        const missingCompetencyIds = competencyIds.filter((id) => !existingUjcIds.has(id));

        if (missingCompetencyIds.length) {
            await tx.userJobCompetency.createMany({
                data: missingCompetencyIds.map((competencyId) => ({
                    userJobId: resolvedUserJob.id,
                    competencyId,
                })),
                skipDuplicates: true,
            });
        }

        const userJobCompetencies = missingCompetencyIds.length
            ? await tx.userJobCompetency.findMany({
                where: {
                    userJobId: resolvedUserJob.id,
                    competencyId: {in: competencyIds},
                },
            })
            : existingUjcs;

        const ujcByCompetencyId = new Map(
            userJobCompetencies.map((ujc: any) => [ujc.competencyId, ujc])
        );

        const competencyState = new Map<
            string,
            {
                ujc: any;
                theta: number;
                thetaVar: number;
                thetaBefore: number | null;
                thetaUpdatedAt: Date | null;
                halfLifeDays: number;
                halfLifeBefore: number;
                halfLifeAfter: number;
                lastPracticedAt: Date | null;
                hlrUpdatedAt: Date | null;
            }
        >();

        for (const ujc of userJobCompetencies) {
            competencyState.set(ujc.competencyId, {
                ujc,
                theta: Number(ujc.theta ?? 0),
                thetaVar: Number(ujc.thetaVar ?? 1),
                thetaBefore: null,
                thetaUpdatedAt: ujc.thetaUpdatedAt ?? null,
                halfLifeDays: Number(ujc.halfLifeDays ?? 1),
                halfLifeBefore: Number(ujc.halfLifeDays ?? 1),
                halfLifeAfter: Number(ujc.halfLifeDays ?? 1),
                lastPracticedAt: ujc.lastPracticedAt ?? null,
                hlrUpdatedAt: ujc.hlrUpdatedAt ?? null,
            });
        }

        for (const item of items) {
            const resolved = resolvedByQuestionId.get(item.questionId);
            if (!resolved) {
                continue;
            }
            const state = competencyState.get(resolved.competencyId);
            if (!state) {
                continue;
            }
            if (state.thetaBefore === null) {
                state.thetaBefore = state.theta;
            }
            const p = sigmoid(state.theta - Number(resolved.question.irtB ?? 0));
            const y = resolved.isCorrect ? 1 : 0;
            state.theta = state.theta + IRT_LEARNING_RATE * (y - p);
            const info = p * (1 - p);
            const currentVar = state.thetaVar > 0 ? state.thetaVar : 1;
            state.thetaVar = 1 / (1 / currentVar + info);
            state.thetaUpdatedAt = completedAt;
        }

        const bRefRows = await tx.quizQuestion.findMany({
            where: {
                competencyId: {in: competencyIds},
                isBankActive: true,
            },
            select: {competencyId: true, irtB: true},
        });
        const bRefValues = new Map<string, number[]>();
        for (const row of bRefRows) {
            const list = bRefValues.get(row.competencyId) ?? [];
            list.push(Number(row.irtB ?? 0));
            bRefValues.set(row.competencyId, list);
        }

        const computeMedian = (values: number[]) => {
            if (!values.length) return 0;
            const sorted = [...values].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            if (sorted.length % 2) {
                return sorted[mid];
            }
            return (sorted[mid - 1] + sorted[mid]) / 2;
        };

        const families = await tx.competenciesFamily.findMany({
            include: {competencies: {select: {id: true}}},
            orderBy: {slug: 'asc'},
        });
        const familyIds = families.map((family: any) => family.id);

        let targetValuesByFamily = new Map<
            string,
            {junior: number; mid: number; senior: number}
        >();
        if (resolvedUserJob.jobId) {
            const jobKiviats = await tx.jobKiviat.findMany({
                where: {
                    jobId: resolvedUserJob.jobId,
                    competenciesFamilyId: {in: familyIds},
                    level: {
                        in: [
                            JobProgressionLevel.JUNIOR,
                            JobProgressionLevel.MIDLEVEL,
                            JobProgressionLevel.SENIOR,
                        ],
                    },
                },
                select: {competenciesFamilyId: true, level: true, radarScore0to5: true},
            });
            for (const familyId of familyIds) {
                const values = jobKiviats.filter((k: any) => k.competenciesFamilyId === familyId);
                if (!values.length) {
                    continue;
                }
                const getValue = (level: JobProgressionLevel) =>
                    Number(values.find((k: any) => k.level === level)?.radarScore0to5 ?? 0);
                targetValuesByFamily.set(familyId, {
                    junior: getValue(JobProgressionLevel.JUNIOR),
                    mid: getValue(JobProgressionLevel.MIDLEVEL),
                    senior: getValue(JobProgressionLevel.SENIOR),
                });
            }
        } else if (resolvedUserJob.scope === UserJobScope.JOB_FAMILY && resolvedUserJob.selectedJobs?.length) {
            const selectedJobIds = resolvedUserJob.selectedJobs.map((selection: any) => selection.jobId);
            const jobKiviats = await tx.jobKiviat.findMany({
                where: {
                    jobId: {in: selectedJobIds},
                    competenciesFamilyId: {in: familyIds},
                    level: {
                        in: [
                            JobProgressionLevel.JUNIOR,
                            JobProgressionLevel.MIDLEVEL,
                            JobProgressionLevel.SENIOR,
                        ],
                    },
                },
                select: {competenciesFamilyId: true, level: true, radarScore0to5: true},
            });
            for (const familyId of familyIds) {
                const entries = jobKiviats.filter((k: any) => k.competenciesFamilyId === familyId);
                if (!entries.length) {
                    continue;
                }
                const avg = (level: JobProgressionLevel) => {
                    const values = entries
                        .filter((k: any) => k.level === level)
                        .map((k: any) => Number(k.radarScore0to5));
                    return values.length ? values.reduce((sum: number, v: number) => sum + v, 0) / values.length : 0;
                };
                targetValuesByFamily.set(familyId, {
                    junior: avg(JobProgressionLevel.JUNIOR),
                    mid: avg(JobProgressionLevel.MIDLEVEL),
                    senior: avg(JobProgressionLevel.SENIOR),
                });
            }
        }

        const pendingHistoryCreates: any[] = [];
        const ratingInputs = new Map<string, {ujcId: string; competencyId: string; masteryNow: number}>();

        for (const [competencyId, state] of competencyState.entries()) {
            const agg = competencyAgg.get(competencyId);
            if (!agg) {
                continue;
            }

            const pSession = agg.totalCount > 0 ? agg.correctCount / agg.totalCount : 0;
            const lastPracticedAt = state.lastPracticedAt;
            const lagSecondsSincePrev = lastPracticedAt
                ? Math.max(0, Math.round((completedAt.getTime() - lastPracticedAt.getTime()) / 1000))
                : null;

            let nextHalfLife = state.halfLifeDays;
            if (!lastPracticedAt) {
                nextHalfLife = 1 + 2 * pSession;
            } else if (pSession >= 0.8) {
                nextHalfLife *= 1.25;
            } else if (pSession >= 0.5) {
                nextHalfLife *= 1.05;
            } else {
                nextHalfLife *= 0.7;
            }

            nextHalfLife = clamp(nextHalfLife, 0.25, 365);
            state.halfLifeBefore = state.halfLifeDays;
            state.halfLifeAfter = nextHalfLife;
            state.halfLifeDays = nextHalfLife;
            state.lastPracticedAt = completedAt;
            state.hlrUpdatedAt = completedAt;

            const bRef = computeMedian(bRefValues.get(competencyId) ?? []);
            const pSkill = sigmoid(state.theta - bRef);
            const masteryNow = pSkill;
            const mastery30d = pSkill * Math.pow(2, -30 / nextHalfLife);

            const newCurrentScore = Number(state.ujc.currentScore ?? 0) + agg.scorePoints;
            const newMaxScore = Number(state.ujc.maxScore ?? 0) + agg.maxPoints;
            const newPercentage = newMaxScore > 0 ? (newCurrentScore / newMaxScore) * 100 : 0;
            const bestScore = Math.max(Number(state.ujc.bestScore ?? 0), agg.scorePoints);

            await tx.userJobCompetency.update({
                where: {id: state.ujc.id},
                data: {
                    currentScore: newCurrentScore,
                    maxScore: newMaxScore,
                    percentage: newPercentage,
                    attemptsCount: Number(state.ujc.attemptsCount ?? 0) + 1,
                    bestScore,
                    lastQuizAt: completedAt,
                    theta: state.theta,
                    thetaVar: state.thetaVar,
                    thetaUpdatedAt: state.thetaUpdatedAt ?? completedAt,
                    halfLifeDays: state.halfLifeDays,
                    lastPracticedAt: state.lastPracticedAt,
                    hlrUpdatedAt: state.hlrUpdatedAt,
                    masteryNow,
                    mastery30d,
                },
            });

            ratingInputs.set(competencyId, {
                ujcId: state.ujc.id,
                competencyId,
                masteryNow,
            });

            const featuresSnapshot: Record<string, unknown> = {
                k: agg.totalCount,
                r: agg.correctCount,
                p_session: pSession,
                avgTime: agg.totalCount ? agg.totalTime / agg.totalCount : 0,
                meanB: agg.itemCount ? agg.sumB / agg.itemCount : 0,
                theta_before: state.thetaBefore ?? state.theta,
                attempts_total: Number(state.ujc.attemptsCount ?? 0),
                quizId: quiz.id,
                scope: resolvedUserJob.scope,
            };

            if (resolvedUserJob.scope === UserJobScope.JOB_FAMILY) {
                featuresSnapshot.effectiveJobIds = effectiveJobIds;
            }

            pendingHistoryCreates.push({
                competencyId,
                data: {
                    userJobCompetencyId: state.ujc.id,
                    userQuizId: updatedUserQuiz.id,
                    score: agg.correctCount,
                    maxScore: agg.totalCount,
                    percentage: pSession,
                    lagSecondsSincePrev,
                    featuresSnapshot,
                    thetaBefore: state.thetaBefore ?? state.theta,
                    thetaAfter: state.theta,
                    halfLifeBeforeDays: state.halfLifeBefore,
                    halfLifeAfterDays: state.halfLifeAfter,
                    createdAt: completedAt,
                },
            });
        }

        const allCompetencyIds = families.flatMap((family: any) =>
            family.competencies.map((comp: any) => comp.id)
        );
        const allUjcs = await tx.userJobCompetency.findMany({
            where: {
                userJobId: resolvedUserJob.id,
                competencyId: {in: allCompetencyIds},
            },
            select: {competencyId: true, mastery30d: true, masteryNow: true},
        });
        const masteryByAllCompetencyId = new Map<string, {mastery30d: number; masteryNow: number}>(
            allUjcs.map((ujc: any) => [
                ujc.competencyId,
                {
                    mastery30d: Number(ujc.mastery30d ?? 0),
                    masteryNow: Number(ujc.masteryNow ?? ujc.mastery30d ?? 0),
                },
            ])
        );

        const daysSinceStart = resolvedUserJob.createdAt
            ? (completedAt.getTime() - new Date(resolvedUserJob.createdAt).getTime()) / (1000 * 60 * 60 * 24)
            : 0;
        const masteryBlendWeight = clamp(1 - daysSinceStart / 30, 0, 1);

        const radarRows = [];
        for (const family of families) {
            const competencyIdsForFamily = family.competencies.map((comp: any) => comp.id);
            const continuous0to10 = competencyIdsForFamily.reduce(
                (sum: number, compId: string) => {
                    const mastery = masteryByAllCompetencyId.get(compId) ?? {mastery30d: 0, masteryNow: 0};
                    const blended = masteryBlendWeight * mastery.masteryNow
                        + (1 - masteryBlendWeight) * mastery.mastery30d;
                    return sum + blended;
                },
                0,
            );
            const rawScore0to10 = clamp(continuous0to10, 0, 10);
            const masteryAvg0to1 = competencyIdsForFamily.length
                ? continuous0to10 / competencyIdsForFamily.length
                : 0;
            const radarScore0to5 = clamp(rawScore0to10 / 2, 0, 5);

            const targets = targetValuesByFamily.get(family.id);
            let level: JobProgressionLevel | null = null;
            if (targets) {
                level = radarScore0to5 <= targets.junior
                    ? JobProgressionLevel.JUNIOR
                    : radarScore0to5 <= targets.mid
                        ? JobProgressionLevel.MIDLEVEL
                        : radarScore0to5 <= targets.senior
                            ? JobProgressionLevel.SENIOR
                            : JobProgressionLevel.EXPERT;
            }

            const userJobKiviat = await tx.userJobKiviat.upsert({
                where: {
                    userJobId_competenciesFamilyId: {
                        userJobId: resolvedUserJob.id,
                        competenciesFamilyId: family.id,
                    },
                },
                update: {
                    rawScore0to10,
                    radarScore0to5,
                    continuous0to10,
                    masteryAvg0to1,
                    level,
                },
                create: {
                    userJobId: resolvedUserJob.id,
                    competenciesFamilyId: family.id,
                    rawScore0to10,
                    radarScore0to5,
                    continuous0to10,
                    masteryAvg0to1,
                    level,
                },
            });

            await tx.userJobKiviatHistory.create({
                data: {
                    rawScore0to10,
                    radarScore0to5,
                    continuous0to10,
                    masteryAvg0to1,
                    level,
                    createdAt: completedAt,
                    userJobKiviat: {connect: {id: userJobKiviat.id}},
                    userQuiz: {connect: {id: updatedUserQuiz.id}},
                },
            });

            radarRows.push(userJobKiviat);
        }

        const totalRaw = radarRows.reduce((sum: number, row: any) => sum + Number(row.rawScore0to10 ?? 0), 0);
        const nextTier = totalRaw <= 10
            ? LeagueTier.IRON
            : totalRaw <= 20
                ? LeagueTier.BRONZE
                : totalRaw <= 30
                    ? LeagueTier.SILVER
                    : totalRaw <= 40
                        ? LeagueTier.GOLD
                        : LeagueTier.PLATINUM;
        const nextLeaguePoints = totalRaw;

        const previousTier = resolvedUserJob.leagueTier;
        const previousPoints = resolvedUserJob.leaguePoints ?? 0;
        const tierChanged = previousTier !== nextTier;

        const progressionLevel = mapLeagueTierToProgressionLevel(nextTier);
        const ratingCompetencyIds = tierChanged ? [] : Array.from(ratingInputs.keys());
        const ratingRows = await tx.userJobCompetency.findMany({
            where: {
                userJobId: resolvedUserJob.id,
                ...(tierChanged ? {} : {competencyId: {in: ratingCompetencyIds}}),
            },
            select: {
                id: true,
                competencyId: true,
                masteryNow: true,
                competency: {select: {families: {select: {id: true}}}},
            },
        });

        const ratingByCompetencyId = new Map<string, CompetencyRating>();
        for (const row of ratingRows) {
            const familyIdsFromQuiz = competencyFamilyIdsById.get(row.competencyId) ?? [];
            const familyIdsFromDb = row.competency?.families?.map((family: any) => family.id) ?? [];
            const familyIds = familyIdsFromQuiz.length ? familyIdsFromQuiz : familyIdsFromDb;

            let bestTarget: number | null = null;
            for (const familyId of familyIds) {
                const target = getTargetForProgressionLevel(targetValuesByFamily.get(familyId), progressionLevel);
                if (target === null) continue;
                bestTarget = bestTarget === null ? target : Math.max(bestTarget, target);
            }

            const rating = computeCompetencyRating(Number(row.masteryNow ?? 0), bestTarget);
            ratingByCompetencyId.set(row.competencyId, rating);

            await tx.userJobCompetency.update({
                where: {id: row.id},
                data: {rating},
            });
        }

        for (const entry of pendingHistoryCreates) {
            const rating = ratingByCompetencyId.get(entry.competencyId) ?? CompetencyRating.MOYEN;
            await tx.userJobCompetencyHistory.create({
                data: {
                    ...entry.data,
                    rating,
                },
            });
        }

        const userJobUpdateData: any = {
            leagueTier: nextTier,
            leaguePoints: nextLeaguePoints,
        };
        if (tierChanged) {
            userJobUpdateData.lastLeagueChange = completedAt;
        }
        await tx.userJob.update({
            where: {id: resolvedUserJob.id},
            data: userJobUpdateData,
        });

        if (tierChanged) {
            await tx.userJobLeagueHistory.create({
                data: {
                    userJobId: resolvedUserJob.id,
                    fromTier: previousTier,
                    toTier: nextTier,
                    deltaPoints: nextLeaguePoints - previousPoints,
                    reason: "QUIZ_COMPLETED",
                    createdAt: completedAt,
                },
            });
        }

        await updateUserJobStats(resolvedUserJob.id, completedAt, tx);

        return {
            updatedUserQuiz,
            userJob: resolvedUserJob,
            wasAlreadyCompleted: false,
            radar: radarRows,
            leagueTier: nextTier,
            leaguePoints: nextLeaguePoints,
        };
    });

    if (!wasAlreadyCompleted) {
        await trackEvent(
            userJob.id,
            'QUIZ_COMPLETED',
            {
                quizType: updatedUserQuiz.type,
                quizId: updatedUserQuiz.quizId,
                quizIndex: updatedUserQuiz.index + 1,
                score: updatedUserQuiz.percentage ?? 0,
                completedAt: updatedUserQuiz.completedAt ?? undefined,
            },
            timezone,
            userId,
        );

        realtimeBus.publishToUser(userId, 'progress.updated', {
            userJobId: userJob.id,
            jobId: userJob.jobId ?? jobId,
            quizId: updatedUserQuiz.quizId,
            quizType: updatedUserQuiz.type,
            percentage: updatedUserQuiz.percentage ?? 0,
            totalScore: updatedUserQuiz.totalScore,
            maxScore: updatedUserQuiz.maxScore,
            bonusPoints: updatedUserQuiz.bonusPoints ?? 0,
            completedAt: updatedUserQuiz.completedAt ?? undefined,
        });
    }

    let quizResult = updatedUserQuiz;
    if (!wasAlreadyCompleted) {
        const jobIdForGeneration = userJob.jobId ?? jobId;
        quizResult = await generateNextQuiz(updatedUserQuiz, userJob.id, userId, jobIdForGeneration);
    }

    let generatedArticle = null;
    if (!wasAlreadyCompleted) {
        try {
            const enqueued = await enqueueArticleGenerationJob({userJobId: userJob.id, userId});
            if (!enqueued && process.env.RUN_WORKERS !== "0") {
                setImmediate(() => {
                    import("./generateMarkdownArticleForLastQuiz")
                        .then(({generateMarkdownArticleForLastQuiz}) => generateMarkdownArticleForLastQuiz(userJob.id, userId))
                        .catch((err) => console.error('Failed to auto-generate markdown article after quiz completion', err));
                });
            }
        } catch (err) {
            console.error('Failed to enqueue markdown article generation', err);
        }
    }

    return {
        ...quizResult,
        radar,
        leagueTier,
        leaguePoints,
        generatedArticle,
    };
};


export type UserJobRankingRow = {
    userJobId: string;
    userId: string;
    firstname: string | null;
    lastname: string | null;
    jobId: string | null;
    jobTitle: string | null;
    totalScore: number;
    maxScoreSum: number;
    percentage: number;
    completedQuizzes: number;
    lastQuizAt: Date | null;
    rank: number;
    id: string;
    firstName: string | null;
    lastName: string | null;
    profilePictureUrl: string | null;
    diamonds: number;
    questionsAnswered: number;
    performance: number;
    sinceDate: Date;
};

export type GetRankingForJobParams = {
    jobId: string;
    from?: string;
    to?: string;
    lang?: string;
};

export async function listLearningResourcesForUserJob(userJobId: string, userId: string, lang: string = 'en') {
    // Vérifier que l'utilisateur est bien propriétaire du userJob
    const userJob = await prisma.userJob.findFirst({
        where: {id: userJobId, userId},
        select: {id: true, jobId: true, jobFamilyId: true},
    });

    if (!userJob) {
        throw new Error('Job utilisateur introuvable pour cet utilisateur.');
    }

    // Récupérer les ressources personnalisées du userJob ET les ressources système par défaut du métier
    const resources = await prisma.learningResource.findMany({
        where: {
            OR: [
                {userJobId: userJob.id}, // spécifiques à ce userJob
                ...(userJob.jobId
                    ? [{
                        jobId: userJob.jobId,
                        source: LearningResourceSource.SYSTEM_DEFAULT, // ressources par défaut du métier
                    }]
                    : []),
                ...(userJob.jobFamilyId
                    ? [{
                        jobFamilyId: userJob.jobFamilyId,
                        source: LearningResourceSource.SYSTEM_DEFAULT, // ressources par défaut de la famille
                    }]
                    : []),
            ],
        },
        orderBy: {createdAt: 'desc'},
    });

    const resourcesWithWaveform = await Promise.all(resources.map(async (resource) => {
        if (resource.type !== 'PODCAST' || !resource.mediaUrl) {
            return resource;
        }

        const currentMetadata = resource.metadata;
        const metadataObject = currentMetadata && typeof currentMetadata === 'object' && !Array.isArray(currentMetadata)
            ? {...currentMetadata as Record<string, unknown>}
            : {};

        if (metadataObject.waveform) {
            return resource;
        }

        const waveform = await computeWaveformFromMediaUrl(resource.mediaUrl);
        if (!waveform) {
            return resource;
        }

        const updated = await prisma.learningResource.update({
            where: {id: resource.id},
            data: {
                metadata: {
                    ...metadataObject,
                    waveform,
                },
            },
        });

        return updated;
    }));

    return resourcesWithWaveform;
}

export async function getRankingForJob({jobId, from, to, lang,}: GetRankingForJobParams): Promise<UserJobRankingRow[]> {
    const resolved = await resolveJobOrFamilyId(jobId);
    const scopeFilter = resolved.scope === UserJobScope.JOB_FAMILY
        ? Prisma.sql`AND uj.scope = ${UserJobScope.JOB_FAMILY}::"UserJobScope" AND uj."jobFamilyId" = ${resolved.jobFamilyId!}::uuid`
        : Prisma.sql`AND uj.scope = ${UserJobScope.JOB}::"UserJobScope" AND uj."jobId" = ${resolved.jobId!}::uuid`;
    const jobIdSelect = resolved.scope === UserJobScope.JOB_FAMILY
        ? Prisma.sql`jf.id`
        : Prisma.sql`uj."jobId"`;
    const jobTitleSelect = resolved.scope === UserJobScope.JOB_FAMILY
        ? Prisma.sql`jf.name`
        : Prisma.sql`j.title`;

    // fragments pour la période
    const fromFilter =
        from ? Prisma.sql`AND uq."completedAt" >= ${from}::timestamp` : Prisma.empty;
    const toFilter =
        to ? Prisma.sql`AND uq."completedAt" < ${to}::timestamp` : Prisma.empty;

    // language=SQL format=false
    const rows = await prisma.$queryRaw<UserJobRankingRow[]>`
        WITH base AS (
            SELECT
                uj.id,
                uj."userId",
                uj."createdAt" AS "sinceDate"
            FROM "UserJob" uj
            WHERE 1=1
            ${scopeFilter}
        ),
        quiz_stats AS (
            SELECT
                b.id AS "userJobId",
                COALESCE(CAST(SUM(uq."totalScore") AS INTEGER), 0) AS "totalScore",
                COALESCE(CAST(SUM(uq."maxScore") AS INTEGER), 0) AS "maxScoreSum",
                COALESCE(CAST(SUM(uq."totalScore" + uq."bonusPoints") AS INTEGER), 0) AS "diamonds",
                COALESCE(CAST(COUNT(uq.id) AS INTEGER), 0) AS "completedQuizzes",
                MAX(uq."completedAt") AS "lastQuizAt"
            FROM base b
            LEFT JOIN "UserQuiz" uq
                ON uq."userJobId" = b.id
                AND uq.status = 'COMPLETED'
                ${fromFilter}
                ${toFilter}
            GROUP BY b.id
        ),
        answer_stats AS (
            SELECT
                b.id AS "userJobId",
                COALESCE(CAST(COUNT(uqa.id) AS INTEGER), 0) AS "questionsAnswered",
                COALESCE(CAST(SUM(CASE WHEN uqa."isCorrect" THEN 1 ELSE 0 END) AS INTEGER), 0) AS "correctCount"
            FROM base b
            LEFT JOIN "UserQuiz" uq
                ON uq."userJobId" = b.id
                AND uq.status = 'COMPLETED'
                ${fromFilter}
                ${toFilter}
            LEFT JOIN "UserQuizAnswer" uqa
                ON uqa."userQuizId" = uq.id
            GROUP BY b.id
        )
        SELECT
            b.id AS "userJobId",
            u.id AS "userId",
            u.firstname,
            u.lastname,
            ${jobIdSelect} AS "jobId",
            ${jobTitleSelect} AS "jobTitle",
            COALESCE(qs."totalScore", 0) AS "totalScore",
            COALESCE(qs."maxScoreSum", 0) AS "maxScoreSum",
            CASE
                WHEN COALESCE(qs."maxScoreSum", 0) > 0
                    THEN
                    ROUND(
                            (
                                100.0
                                    * COALESCE(qs."totalScore", 0)::double precision
                                    / NULLIF(qs."maxScoreSum"::double precision, 0)
                                )::numeric,
                            2
                    )::double precision
                ELSE 0
            END AS "percentage",
            COALESCE(qs."completedQuizzes", 0) AS "completedQuizzes",
            qs."lastQuizAt" AS "lastQuizAt",
            u.id AS "id",
            u.firstname AS "firstName",
            u.lastname AS "lastName",
            u."avatarUrl" AS "profilePictureUrl",
            COALESCE(qs."diamonds", 0) AS "diamonds",
            CAST(
                RANK() OVER (
                    ORDER BY
                        COALESCE(qs."diamonds", 0) DESC,
                        b."sinceDate" ASC
                )
                AS INTEGER
            ) AS "rank",
            COALESCE(ans."questionsAnswered", 0) AS "questionsAnswered",
            CASE
                WHEN COALESCE(ans."questionsAnswered", 0) > 0
                    THEN (ans."correctCount"::double precision / ans."questionsAnswered")
                ELSE 0
            END AS "performance",
            b."sinceDate"
        FROM base b
        JOIN "User" u ON u.id = b."userId"
        JOIN "UserJob" uj ON uj.id = b.id
        LEFT JOIN "Job" j ON j.id = uj."jobId"
        LEFT JOIN "JobFamily" jf ON jf.id = uj."jobFamilyId"
        LEFT JOIN quiz_stats qs ON qs."userJobId" = b.id
        LEFT JOIN answer_stats ans ON ans."userJobId" = b.id
        ORDER BY "rank" ASC;
    `;
    if (!rows.length || !lang) {
        return rows;
    }

    if (resolved.scope === UserJobScope.JOB_FAMILY) {
        const jobFamily = await prisma.jobFamily.findUnique({
            where: {id: resolved.jobFamilyId!},
            select: {id: true, name: true},
        });
        if (!jobFamily) {
            return rows;
        }
        const localizedJobFamily = await resolveFields({
            entity: 'JobFamily',
            entityId: jobFamily.id,
            fields: ['name'],
            lang,
            base: jobFamily,
        }) as typeof jobFamily;
        return rows.map((row) => ({
            ...row,
            jobTitle: localizedJobFamily.name,
        }));
    }

    const job = await prisma.job.findUnique({
        where: {id: resolved.jobId!},
        select: {id: true, title: true},
    });
    if (!job) {
        return rows;
    }
    const localizedJob = await resolveFields({
        entity: 'Job',
        entityId: job.id,
        fields: ['title'],
        lang,
        base: job,
    }) as typeof job;
    return rows.map((row) => ({
        ...row,
        jobTitle: localizedJob.title,
    }));
}

type UserJobCompetencyProfile = {
    userJobId: string;
    job: {
        id: string;
        title: string;
        slug: string;
        description: string | null;
        competencyFamilies: {
            id: string;
            name: string;
        }[];
    };
    user: {
        id: string;
        firstname: string | null;
        lastname: string | null;
        email: string | null;
    };
    summary: {
        totalCompetencies: number;
        avgPercentage: number;
        strongCount: number; // ex: >= 70%
        weakCount: number;   // ex: < 40%
        lastQuizAt: Date | null;
    };
    competencies: Array<{
        competencyId: string;
        competencyFamiliesIds: string[];
        name: string;
        slug: string;
        type: string; // "HARD_SKILL" | "SOFT_SKILL"
        level: string; // enum Level
        percentage: number;
        currentScore: number;
        maxScore: number;
        attemptsCount: number;
        bestScore: number;
        lastQuizAt: Date | null;
        // mini historique pour graphe
        history: Array<{
            date: Date;
            score: number;
            maxScore: number;
            percentage: number;
        }>;
    }>;
    kiviats: any; // à typer plus précisément si besoin
};

// ce qui part en JSON vers le front
export type JobKiviatDto = {
    id: string;
    jobId: string | null;
    userJobId: string | null;
    competenciesFamilyId: string;
    level: string | null; // JobProgressionLevel en string
    rawScore0to10: number;
    radarScore0to5: number;
    continuous0to10: number;
    masteryAvg0to1: number;
    job?: any | null;
    userJob?: any | null;
    competenciesFamily?: any | null;
};

// Map<int, List<JobKiviat>> -> côté JSON : Record<number, JobKiviatDto[]>
export type JobKiviatSnapshotsDto = {
    [index: number]: JobKiviatDto[];
};

export async function getLastKiviatSnapshotsForUserJob(
    userJobId: string,
    jobIds: string[],
    count = 5, // nombre de kiviats à renvoyer
): Promise<JobKiviatSnapshotsDto> {
    // 1) Familles du job dans un ordre fixe
    const families = await prisma.competenciesFamily.findMany({
        where: {
            jobs: {
                some: { id: { in: jobIds } },
            },
        },
        orderBy: { slug: "asc" },
    });

    if (families.length === 0) {
        return {};
    }

    // 2) Historiques Kiviat pour ce userJob + ces familles
    const histories = await prisma.userJobKiviatHistory.findMany({
        where: {
            userJobKiviat: {
                userJobId,
                competenciesFamilyId: { in: families.map((f) => f.id) },
            },
        },
        include: {
            userJobKiviat: {
                include: {
                    competenciesFamily: true,
                    userJob: {
                        include: {
                            job: true,
                        },
                    },
                },
            },
        },
        orderBy: { createdAt: "desc" },
        // maximum théorique si tout est complet : count kiviats * 5 familles
        take: count * families.length,
    });

    if (histories.length === 0) {
        return {};
    }

    type HistoryWithIncludes = (typeof histories)[number];

    // 3) Grouper les lignes par userQuizId
    const byQuizId = new Map<
        string,
        { createdAt: Date; rows: HistoryWithIncludes[] }
    >();

    for (const h of histories) {
        const quizId = h.userQuizId;
        const existing = byQuizId.get(quizId);

        if (existing) {
            existing.rows.push(h);
            // on garde la date la plus récente pour trier
            if (h.createdAt > existing.createdAt) {
                existing.createdAt = h.createdAt;
            }
        } else {
            byQuizId.set(quizId, {
                createdAt: h.createdAt,
                rows: [h],
            });
        }
    }

    // 4) Trier les snapshots (plus récents en premier) et garder les `count` derniers
    const sortedSnapshots = Array.from(byQuizId.entries())
        .sort((a, b) => b[1].createdAt.getTime() - a[1].createdAt.getTime())
        .slice(0, count);

    const result: JobKiviatSnapshotsDto = {};

    // 5) Pour chaque snapshot, construire la liste [JobKiviat1..5] dans l'ordre des familles
    sortedSnapshots.forEach(([quizId, snapshot], index) => {
        const rowsByFamilyId = new Map<
            string,
            HistoryWithIncludes
        >(
            snapshot.rows.map((r) => [r.userJobKiviat.competenciesFamilyId, r]),
        );

        const list: JobKiviatDto[] = [];

        for (const family of families) {
            const row = rowsByFamilyId.get(family.id);
            if (!row) {
                // si une famille manque pour ce quiz, soit tu la skip,
                // soit tu pousses une valeur neutre (à toi de décider)
                continue;
            }

            const ujk = row.userJobKiviat;
            const userJob = ujk.userJob;

            list.push({
                id: row.id, // on utilise l'ID d'historique comme identifiant
                jobId: userJob?.jobId ?? null,
                userJobId: ujk.userJobId,
                competenciesFamilyId: ujk.competenciesFamilyId,
                level: ujk.level, // JobProgressionLevel en string
                rawScore0to10: row.rawScore0to10,
                radarScore0to5: row.radarScore0to5,
                continuous0to10: row.continuous0to10,
                masteryAvg0to1: row.masteryAvg0to1,
                job: userJob?.job ?? null,
                userJob: userJob ?? null,
                competenciesFamily: ujk.competenciesFamily ?? null,
            });
        }

        result[index] = list;
    });

    return result;
}

export const getUserJobCompetencyProfile = async (
    userId: string,
    userJobId: string,
    lang: string = 'en'
): Promise<UserJobCompetencyProfile> => { // si tu veux typer strictement
// ) => {
    // 1. Récupérer le UserJob + user + job (et vérifier qu’il existe)
    const userJob = await prisma.userJob.findUnique({
        where: {
            id: userJobId,
            userId,
        },
        include: {
            user: {
                select: {
                    id: true,
                    firstname: true,
                    lastname: true,
                    email: true,
                },
            },
            job: {
                select: {
                    id: true,
                    title: true,
                    slug: true,
                    description: true,
                    competenciesFamilies: {
                        select: {id: true, name: true},
                    },
                },
            },
            jobFamily: true,
            selectedJobs: {select: {jobId: true}},
            kiviats: {
                select: {
                    histories: {}
                }
            },
        },
    });

    if (!userJob) {
        throw new Error("Aucun lien UserJob trouvé pour cet utilisateur et ce métier.");
    }
    if (userJob.scope === UserJobScope.JOB_FAMILY) {
        const selectedJobIds = userJob.selectedJobs.map((sj) => sj.jobId);
        if (!selectedJobIds.length) {
            throw new Error('Aucun métier sélectionné pour ce UserJob.');
        }

        const userJobCompetencies = await prisma.userJobCompetency.findMany({
            where: {
                userJobId: userJob.id,
            },
            include: {
                competency: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        type: true,
                        level: true,
                        families: {select: {id: true, name: true, slug: true}},
                    },
                },
                histories: {
                    include: {
                        userQuiz: {
                            select: {
                                jobsSnapshot: true,
                                completedAt: true,
                            },
                        },
                    },
                    orderBy: {createdAt: "asc"},
                },
            },
        });

        const isHistoryActive = (jobsSnapshot: any) => {
            if (!Array.isArray(jobsSnapshot) || jobsSnapshot.length === 0) {
                return true;
            }
            return jobsSnapshot.some((jobId) => selectedJobIds.includes(String(jobId)));
        };

        const competencies = userJobCompetencies.map((ujc) => {
            const filteredHistories = ujc.histories.filter((h) =>
                isHistoryActive(h.userQuiz?.jobsSnapshot)
            );
            const totalScore = filteredHistories.reduce((sum, h) => sum + (h.score ?? 0), 0);
            const maxScore = filteredHistories.reduce((sum, h) => sum + (h.maxScore ?? 0), 0);
            const attemptsCount = filteredHistories.length;
            const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
            const bestScore = filteredHistories.reduce((best, h) => Math.max(best, h.score ?? 0), 0);
            const lastQuizAt = filteredHistories.reduce<Date | null>((acc, h) => {
                const date = h.userQuiz?.completedAt ?? h.createdAt;
                if (!acc || date > acc) return date;
                return acc;
            }, null);

            const history = filteredHistories
                .map((h) => ({
                    date: h.createdAt,
                    score: h.score,
                    maxScore: h.maxScore,
                    percentage: h.percentage,
                }))
                .sort((a, b) => a.date.getTime() - b.date.getTime());

            const trimmedHistory = history.length > 20 ? history.slice(history.length - 20) : history;

            return {
                competencyId: ujc.competencyId,
                competencyFamiliesIds: ujc.competency.families.map((f) => f.id),
                name: ujc.competency.name,
                slug: ujc.competency.slug,
                type: ujc.competency.type,
                level: ujc.competency.level,
                percentage,
                currentScore: totalScore,
                maxScore,
                attemptsCount,
                bestScore,
                lastQuizAt,
                history: trimmedHistory,
            };
        });

        const localizedCompetencies = await Promise.all(
            competencies.map(async (c) => {
                const loc = await resolveFields({
                    entity: 'Competency',
                    entityId: c.competencyId,
                    fields: ['name', 'description'],
                    lang,
                    base: {name: c.name, description: null},
                });
                return {...c, name: loc.name};
            })
        );

        const familyIds = new Set<string>();
        competencies.forEach((c) => c.competencyFamiliesIds.forEach((id) => familyIds.add(id)));

        if (!familyIds.size) {
            const jobs = await prisma.job.findMany({
                where: {id: {in: selectedJobIds}},
                select: {competenciesFamilies: {select: {id: true}}},
            });
            const familyCounts = new Map<string, number>();
            jobs.forEach((job) => {
                job.competenciesFamilies.forEach((family) => {
                    familyCounts.set(family.id, (familyCounts.get(family.id) ?? 0) + 1);
                });
            });
            Array.from(familyCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .forEach(([familyId]) => familyIds.add(familyId));
        }

        const families = familyIds.size
            ? await prisma.competenciesFamily.findMany({
                where: {id: {in: Array.from(familyIds)}},
                select: {id: true, name: true, slug: true},
            })
            : [];

        const localizedFamilies = await Promise.all(
            families.map(async (f) => {
                const loc = await resolveFields({
                    entity: 'CompetenciesFamily',
                    entityId: f.id,
                    fields: ['name', 'description'],
                    lang,
                    base: f,
                });
                return {id: f.id, name: loc.name};
            })
        );

        const totalCompetencies = competencies.length;
        const avgPercentage =
            totalCompetencies > 0
                ? competencies.reduce((sum, c) => sum + c.percentage, 0) / totalCompetencies
                : 0;
        const strongCount = competencies.filter((c) => c.percentage >= 70).length;
        const weakCount = competencies.filter((c) => c.percentage < 40).length;
        const lastQuizAt =
            competencies.reduce<Date | null>((acc, c) => {
                if (!c.lastQuizAt) return acc;
                if (!acc || c.lastQuizAt > acc) return c.lastQuizAt;
                return acc;
            }, null) ?? null;

        const jobFamily = userJob.jobFamily;
        const localizedJobFamily = jobFamily
            ? await resolveFields({
                entity: 'JobFamily',
                entityId: jobFamily.id,
                fields: ['name'],
                lang,
                base: jobFamily,
            })
            : null;

        const profile: UserJobCompetencyProfile = {
            userJobId: userJob.id,
            job: {
                id: jobFamily?.id ?? userJob.id,
                title: localizedJobFamily?.name ?? 'Famille de metiers',
                slug: jobFamily?.slug ?? 'job-family',
                description: null,
                competencyFamilies: localizedFamilies,
            },
            user: {
                id: userJob.user.id,
                firstname: userJob.user.firstname,
                lastname: userJob.user.lastname,
                email: userJob.user.email,
            },
            summary: {
                totalCompetencies,
                avgPercentage,
                strongCount,
                weakCount,
                lastQuizAt,
            },
            competencies: localizedCompetencies,
            kiviats: (await getLastKiviatSnapshotsForUserJob(userJob.id, selectedJobIds)),
        };

        return profile;
    }
    if (!userJob.job) {
        throw new Error('Job manquant pour ce UserJob');
    }

    // 2. Récupérer toutes les UserJobCompetency pour ce UserJob
    //    + la compétence + un historique (par ex les 10 derniers points)
    const userJobCompetencies = await prisma.userJobCompetency.findMany({
        where: {
            userJobId: userJob.id,
        },
        include: {
            competency: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    type: true,
                    level: true,
                    families: {
                        select: {id: true},
                    }
                },
            },
            histories: {
                orderBy: {createdAt: "asc"}, // pour tracer la progression dans le temps
                take: 20,                      // limite raisonnable, à ajuster
            },
        },
        orderBy: {
            percentage: "desc", // tri par niveau de maîtrise
        },
    });

    // 3. Construire les données détaillées par compétence
    const competencies = userJobCompetencies.map((ujc) => {
        const history = ujc.histories.map((h) => ({
            date: h.createdAt,
            score: h.score,
            maxScore: h.maxScore,
            percentage: h.percentage,
        }));

        return {
            competencyId: ujc.competencyId,
            competencyFamiliesIds: ujc.competency.families.map(f => f.id),
            name: ujc.competency.name,
            slug: ujc.competency.slug,
            type: ujc.competency.type,
            level: ujc.competency.level, // niveau théorique de la compétence
            percentage: ujc.percentage,
            currentScore: ujc.currentScore,
            maxScore: ujc.maxScore,
            attemptsCount: ujc.attemptsCount,
            bestScore: ujc.bestScore,
            lastQuizAt: ujc.lastQuizAt,
            history,
        };
    });

    const localizedCompetencies = await Promise.all(
        competencies.map(async (c) => {
            const loc = await resolveFields({
                entity: 'Competency',
                entityId: c.competencyId,
                fields: ['name', 'description'],
                lang,
                base: {name: c.name, description: null},
            });
            return {...c, name: loc.name};
        })
    );

    const localizedJob = await resolveFields({
        entity: 'Job',
        entityId: userJob.job.id,
        fields: ['title', 'description'],
        lang,
        base: userJob.job,
    });

    const localizedFamilies = await Promise.all(
        userJob.job.competenciesFamilies.map(async (f) => {
            const loc = await resolveFields({
                entity: 'CompetenciesFamily',
                entityId: f.id,
                fields: ['name', 'description'],
                lang,
                base: f,
            });
            return {id: f.id, name: loc.name};
        })
    );

    // 4. Construire un petit résumé global pour le dashboard
    const totalCompetencies = competencies.length;

    const avgPercentage =
        totalCompetencies > 0
            ? competencies.reduce((sum, c) => sum + c.percentage, 0) /
            totalCompetencies
            : 0;

    // Exemple de règles :
    // - strong >= 70%
    // - weak < 40%
    const strongCount = competencies.filter((c) => c.percentage >= 70).length;
    const weakCount = competencies.filter((c) => c.percentage < 40).length;

    const lastQuizAt =
        competencies.reduce<Date | null>((acc, c) => {
            if (!c.lastQuizAt) return acc;
            if (!acc || c.lastQuizAt > acc) return c.lastQuizAt;
            return acc;
        }, null) ?? null;

    // 5. Assembler l’objet final
    const profile: UserJobCompetencyProfile = {
        userJobId: userJob.id,
        job: {
            id: userJob.job.id,
            title: localizedJob.title,
            slug: localizedJob.slug,
            description: localizedJob.description,
            competencyFamilies: localizedFamilies,
        },
        user: {
            id: userJob.user.id,
            firstname: userJob.user.firstname,
            lastname: userJob.user.lastname,
            email: userJob.user.email,
        },
        summary: {
            totalCompetencies,
            avgPercentage,
            strongCount,
            weakCount,
            lastQuizAt,
        },
        competencies: localizedCompetencies,
        kiviats: (await getLastKiviatSnapshotsForUserJob(userJob.id, [userJob.job.id])),
    };

    return profile;
};

export const getCompetencyFamilyDetailsForUserJob = async (
    userId: string,
    userJobId: string,
    cfId: string,
    lang: string = 'en',
) => {
    const userJob = await prisma.userJob.findUnique({
        where: {id: userJobId, userId},
        select: {
            id: true,
            scope: true,
            jobId: true,
            jobFamilyId: true,
            job: {select: {id: true, title: true, description: true, slug: true}},
            jobFamily: {select: {id: true, name: true, slug: true}},
            selectedJobs: {where: {isSelected: true}, select: {jobId: true}},
        },
    });
    if (!userJob) {
        throw new Error('UserJob not found');
    }

    const family = await prisma.competenciesFamily.findUnique({
        where: {id: cfId},
    });
    if (!family) {
        throw new Error('Competency Family not found');
    }

    const jobIds =
        userJob.scope === UserJobScope.JOB
            ? userJob.jobId
                ? [userJob.jobId]
                : []
            : userJob.selectedJobs.map((selection) => selection.jobId);
    if (!jobIds.length) {
        throw new Error('Aucun métier sélectionné pour ce UserJob.');
    }

    const competencies = await prisma.competency.findMany({
        where: {
            jobs: {some: {id: {in: jobIds}}},
            families: {some: {id: cfId}},
        },
        select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            type: true,
            level: true,
        },
    });

    const competencyIds = competencies.map((comp) => comp.id);
    const userStats = competencyIds.length
        ? await prisma.userJobCompetency.findMany({
            where: {
                userJobId: userJob.id,
                competencyId: {in: competencyIds},
            },
            select: {
                competencyId: true,
                rating: true,
                percentage: true,
                masteryNow: true,
                mastery30d: true,
                attemptsCount: true,
                bestScore: true,
                lastQuizAt: true,
            },
        })
        : [];
    const statsByCompetencyId = new Map(
        userStats.map((row) => [row.competencyId, row]),
    );

    const localizedJob =
        userJob.scope === UserJobScope.JOB && userJob.job
            ? await resolveFields({
                entity: 'Job',
                entityId: userJob.job.id,
                fields: ['title', 'description'],
                lang,
                base: userJob.job,
            })
            : null;

    const localizedJobFamily =
        userJob.scope === UserJobScope.JOB_FAMILY && userJob.jobFamily
            ? await resolveFields({
                entity: 'JobFamily',
                entityId: userJob.jobFamily.id,
                fields: ['name'],
                lang,
                base: userJob.jobFamily,
            })
            : null;

    const localizedFamily = await resolveFields({
        entity: 'CompetenciesFamily',
        entityId: family.id,
        fields: ['name', 'description'],
        lang,
        base: family,
    });

    const localizedCompetencies = await Promise.all(
        competencies.map(async (comp) => {
            const loc = await resolveFields({
                entity: 'Competency',
                entityId: comp.id,
                fields: ['name', 'description'],
                lang,
                base: {name: comp.name, description: comp.description ?? null},
            });
            const stats = statsByCompetencyId.get(comp.id);
            return {
                competencyId: comp.id,
                name: loc.name,
                slug: comp.slug,
                type: comp.type,
                level: comp.level,
                rating: stats?.rating ?? null,
                percentage: stats?.percentage ?? 0,
                masteryNow: stats?.masteryNow ?? 0,
                mastery30d: stats?.mastery30d ?? 0,
                attemptsCount: stats?.attemptsCount ?? 0,
                bestScore: stats?.bestScore ?? 0,
                lastQuizAt: stats?.lastQuizAt ?? null,
            };
        }),
    );

    return {
        userJobId: userJob.id,
        scope: userJob.scope,
        job: localizedJob,
        jobFamily: localizedJobFamily,
        family: localizedFamily,
        competencies: localizedCompetencies,
    };
};
