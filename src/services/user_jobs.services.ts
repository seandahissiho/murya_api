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
} from '@prisma/client';
import {prisma} from "../config/db";
import {resolveFields} from "../i18n/translate";
import {buildGenerateQuizInput} from "./quiz_gen/build-generate-quiz-input";
import {enqueueQuizGenerationJob, getRedisClient} from "../config/redis";
import {generateMarkdownArticleForLastQuiz} from "./generateMarkdownArticleForLastQuiz";
import {computeWaveformFromMediaUrl} from "../utils/waveform";
import {trackEvent} from "./quests.services";

async function resolveJobOrFamilyId(targetId: string) {
    const job = await prisma.job.findUnique({
        where: {id: targetId},
        select: {id: true},
    });
    if (job) {
        return {scope: UserJobScope.JOB as const, jobId: job.id, jobFamilyId: null};
    }

    const jobFamily = await prisma.jobFamily.findUnique({
        where: {id: targetId},
        select: {id: true},
    });
    if (jobFamily) {
        return {scope: UserJobScope.JOB_FAMILY as const, jobId: null, jobFamilyId: jobFamily.id};
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

    const userJob = await prisma.userJob.upsert({
        where: {userId_jobFamilyId: {userId, jobFamilyId}},
        update: {},
        create: {
            userId,
            scope: UserJobScope.JOB_FAMILY,
            jobId: null,
            jobFamilyId,
            status: UserJobStatus.TARGET,
        },
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

    const questions = await Promise.all(
        (quiz.questions ?? []).map(async (q: any) => {
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
            value: true,
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
        value: number;
        jobFamily: {id: string; name: string; slug: string} | null;
    }> = [];

    for (const family of localizedFamilies) {
        for (const level of levels) {
            const values = jobKiviats
                .filter((k) => k.competenciesFamilyId === family.id && k.level === level)
                .map((k) => Number(k.value));
            const value = values.length
                ? values.reduce((sum, v) => sum + v, 0) / values.length
                : 0;

            entries.push({
                id: `${family.id}:${level}`,
                jobId: null,
                jobFamilyId: jobFamily?.id ?? null,
                userJobId: null,
                competenciesFamily: family,
                competenciesFamilyId: family.id,
                level,
                value,
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

    const localizedJobFamily = await resolveFields({
        entity: 'JobFamily',
        entityId: userJob.jobFamily.id,
        fields: ['name'],
        lang,
        base: userJob.jobFamily,
    });

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

    await prisma.$transaction(async (tx) => {
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
    });

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
    if (!userJob.job) {
        throw new Error('Job manquant pour ce UserJob');
    }
    if (!userJob.job) {
        throw new Error('Job manquant pour ce UserJob');
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

        const localizedJobFamily = await resolveFields({
            entity: 'JobFamily',
            entityId: userJob.jobFamily.id,
            fields: ['name'],
            lang,
            base: userJob.jobFamily,
        });

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
            questions: {
                include: {
                    responses: {
                        include: {
                            answerOptions: true,
                        },
                        orderBy: {index: 'asc'},
                    },
                    competency: true,
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
                        questions: {
                            select: {
                                points: true,
                            }
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
                    maxScore: quiz.questions.reduce((sum, q) => sum + q.points, 0),
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
            questions: {select: {points: true}},
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
                maxScore: quiz.questions.reduce((sum, q) => sum + q.points, 0),
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
                    questions: {
                        include: {
                            responses: {
                                include: {answerOptions: true},
                                orderBy: {index: 'asc'},
                            },
                            competency: true,
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
                    questions: {
                        include: {
                            responses: {
                                include: {answerOptions: true},
                                orderBy: {index: 'asc'},
                            },
                            competency: true,
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
                questions: {
                    include: {
                        responses: {
                            include: {answerOptions: true},
                            orderBy: {index: 'asc'},
                        },
                        competency: true,
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
            questions: {
                include: {
                    responses: {
                        include: {answerOptions: true},
                        orderBy: {index: 'asc'},
                    },
                    competency: true,
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

async function updateUserJobStats(userJobId: string, doneAt: string) {
    const userJobScope = await prisma.userJob.findUnique({
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
        userJobScope.selectedJobs?.map((selection) => selection.jobId) ?? []
    );

    // 5. Recalculer les agrégats sur UserJob
    const allQuizzes = await prisma.userQuiz.findMany({
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
                return snapshot.some((jobId) => selectedJobIds.has(String(jobId)));
            })
            : allQuizzes;

    // const quizzesCount = filteredQuizzes.length;
    const completedQuizzes = filteredQuizzes.filter(
        (q) => q.status === UserQuizStatus.COMPLETED
    ).length;
    const totalScoreSum = filteredQuizzes.reduce(
        (sum, q) => {
            const total = (q.totalScore ?? 0) + (q.bonusPoints ?? 0);
            return sum + total;
        },
        0
    );
    const maxScoreSum = filteredQuizzes.reduce((sum, q) => sum + q.maxScoreWithBonus, 0);

    // const lastQuizAt = allQuizzes.reduce<Date | null>((latest, q) => {
    //     if (!q.completedAt) return latest;
    //     if (!latest || q.completedAt > latest) return q.completedAt;
    //     return latest;
    // }, null);

    // lastQuizAt done now
    const lastQuizAt = doneAt;

    await prisma.userJob.update({
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
    await prisma.userJob.updateMany({
        where: {
            userId: (await prisma.userJob.findUnique({
                where: {id: userJobId},
                select: {userId: true},
            }))?.userId,
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
    const quizJobId = jobIdsForQuiz[0];

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
            title: generated.title,
            description: generated.description ?? '',
            level: mapDifficultyToLevel(generated.level),
            type: QuizType.DAILY,
            questions: {
                create: generated.questions.map((q) => {
                    const competencyId = competencyMap.get(q.competencySlug);
                    if (!competencyId) {
                        throw new Error(`Compétence inconnue pour le slug "${q.competencySlug}"`);
                    }
                    return {
                        text: q.text,
                        competencyId,
                        timeLimitInSeconds: q.timeLimitInSeconds ?? 30,
                        points: q.points ?? 1,
                        level: mapDifficultyToLevel(q.difficulty),
                        type: mapQuestionType(q.type),
                        mediaUrl: q.mediaUrl ?? '',
                        index: q.index ?? 0,
                        metadata: q.metadata ?? undefined,
                        responses: {
                            create: q.responses.map((r, idx) => ({
                                text: r.text,
                                metadata: r.metadata ?? undefined,
                                isCorrect: r.isCorrect,
                                index: r.index ?? idx,
                            })),
                        },
                    };
                }),
            },
        },
        include: {
            questions: {
                include: {responses: true, competency: true},
                orderBy: {index: 'asc'},
            },
        },
    });

    const maxIndex = await prisma.userQuiz.aggregate({
        _max: {index: true},
        where: {userJobId},
    });
    const nextIndex = (maxIndex._max.index ?? -1) + 1;

    const maxScore = quiz.questions.reduce((sum, q) => sum + q.points, 0);
    const maxScoreWithBonus = quiz.questions.reduce((sum, q) => sum + q.points + q.timeLimitInSeconds, 0);

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
                    questions: {
                        include: {
                            responses: true,
                            competency: true,
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

export const saveUserQuizAnswers = async (
    jobId: string,
    userQuizId: string,
    userId: string,
    answers: AnswerInput[],
    doneAt: string,
    timezone: string = 'UTC',
    lang: string = 'en',
) => {
    const {updatedUserQuiz, userJobId, wasAlreadyCompleted} = await prisma.$transaction(async (tx: any) => {
        const resolved = await resolveJobOrFamilyId(jobId);

        // 0. Récupérer le UserJob
        const userJob = await tx.userJob.findUnique({
            where: resolved.scope === UserJobScope.JOB
                ? {userId_jobId: {userId, jobId: resolved.jobId!}}
                : {userId_jobFamilyId: {userId, jobFamilyId: resolved.jobFamilyId!}},
            select: {
                id: true,
                jobId: true,
                job: {select: {competenciesFamilies: true}},
            },
        });
        if (!userJob) {
            throw new Error("Job introuvable pour cet utilisateur.");
        }

        // 1. Charger le UserQuiz + quiz + questions + réponses
        const userQuiz = await tx.userQuiz.findUnique({
            where: {
                userJobId_quizId: {userJobId: userJob.id, quizId: userQuizId},
            },
            include: {
                quiz: {
                    include: {
                        job: {include: {competenciesFamilies: true}},
                        questions: {
                            include: {
                                responses: true,
                                competency: {
                                    include: {
                                        families: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!userQuiz) {
            throw new Error("Quiz introuvable pour cet utilisateur et ce job.");
        }

        const jobForStats = userJob.job ?? userQuiz.quiz.job;
        if (!jobForStats) {
            throw new Error("Job manquant pour ce quiz.");
        }

        const wasAlreadyCompleted = userQuiz.status === UserQuizStatus.COMPLETED;

        // Map questionId -> QuizQuestion
        const questionMap = new Map(
            userQuiz.quiz.questions.map((q: any) => [q.id, q])
        );

        // 2. Supprimer les anciennes réponses
        await tx.userQuizAnswer.deleteMany({
            where: {userQuizId: userQuiz.id},
        });

        let totalScore = 0;
        let bonusPoints = 0;
        const maxScore = userQuiz.quiz.questions.reduce(
            (sum: any, q: any) => sum + q.points,
            0
        );
        const maxScoreWithBonus = userQuiz.quiz.questions.reduce(
            (sum: any, q: any) => sum + q.points + q.timeLimitInSeconds,
            0
        );

        // *** NOUVEAU : agrégation par compétence pour CE quiz ***
        const competencyAgg = new Map<
            string,
            { score: number; maxScore: number }
        >();
        const familyAgg = new Map<string, { score: number; maxScore: number }>();

        // 3. Créer les réponses
        for (const rawAnswer of answers) {
            const question: any = questionMap.get(rawAnswer.questionId);
            if (!question) {
                throw new Error(`Question inconnue: ${rawAnswer.questionId}`);
            }

            const responseIds = rawAnswer.responseIds ?? [];

            let isCorrect = false;
            let score = 0;

            if (
                question.type === "single_choice" ||
                question.type === "multiple_choice" ||
                question.type === "true_false"
            ) {
                const correctResponses = question.responses.filter((r: any) => r.isCorrect);
                const correctIds = correctResponses.map((r: any) => r.id);

                const selectedSet = new Set(responseIds);
                const correctSet = new Set(correctIds);

                const sameSize = selectedSet.size === correctSet.size;
                const allCorrectIncluded = correctIds.every((id: any) =>
                    selectedSet.has(id)
                );

                isCorrect = sameSize && allCorrectIncluded;

                score = isCorrect ? question.points : 0;
                bonusPoints += isCorrect
                    ? question.timeLimitInSeconds - (rawAnswer.timeToAnswer ?? 0)
                    : 0;
            } else {
                isCorrect = false;
                score = 0;
            }

            totalScore += score;

            // *** NOUVEAU : alimenter la map par compétence ***
            // QuizQuestion a un champ competencyId dans ton schéma
            const competencyId = question.competencyId;
            if (competencyId) {
                const current =
                    competencyAgg.get(competencyId) ?? {score: 0, maxScore: 0};
                current.score += score;
                // maxScore de la question = ses points, indépendamment de la réponse
                current.maxScore += question.points;
                competencyAgg.set(competencyId, current);


                const families = question.competency?.families ?? [];
                for (const family of families) {
                    const existingFamilyAgg = familyAgg.get(family.id) ?? {score: 0, maxScore: 0};
                    existingFamilyAgg.score += score;
                    existingFamilyAgg.maxScore += question.points;
                    familyAgg.set(family.id, existingFamilyAgg);
                }
            }

            // 3.2 Créer UserQuizAnswer
            const createdAnswer = await tx.userQuizAnswer.create({
                data: {
                    userQuizId: userQuiz.id,
                    questionId: question.id,
                    timeToAnswer: rawAnswer.timeToAnswer ?? 0,
                    freeTextAnswer: rawAnswer.freeTextAnswer ?? null,
                    isCorrect,
                    score,
                },
            });

            // 3.3 Créer UserQuizAnswerOption
            if (responseIds.length > 0) {
                await tx.userQuizAnswerOption.createMany({
                    data: responseIds.map((responseId) => ({
                        userQuizAnswerId: createdAnswer.id,
                        responseId,
                    })),
                });
            }
        }

        const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

        // 4. Mettre à jour le UserQuiz
        const updatedUserQuiz = await tx.userQuiz.update({
            where: {id: userQuiz.id},
            data: {
                totalScore,
                maxScore,
                bonusPoints,
                maxScoreWithBonus,
                percentage,
                status: UserQuizStatus.COMPLETED,
                completedAt: doneAt,
                startedAt: userQuiz.startedAt ?? doneAt,
            },
        });

        // 5. Mettre à jour les stats globales du UserJob
        await updateUserJobStats(userJob.id, doneAt);

        // *** 5bis. NOUVEAU : persister la progression par compétence ***
        // Pour chaque compétence impactée par CE quiz :
        for (const [competencyId, agg] of competencyAgg.entries()) {
            const localPercentage =
                agg.maxScore > 0 ? (agg.score / agg.maxScore) * 100 : 0;

            // Upsert sur UserJobCompetency (état global)
            const ujc = await tx.userJobCompetency.upsert({
                where: {
                    userJobId_competencyId: {
                        userJobId: userJob.id,
                        competencyId,
                    },
                },
                update: {
                    currentScore: {increment: agg.score},
                    maxScore: {increment: agg.maxScore},
                    attemptsCount: {increment: 1},
                    lastQuizAt: updatedUserQuiz.completedAt ?? doneAt,
                },
                create: {
                    userJobId: userJob.id,
                    competencyId,
                    currentScore: agg.score,
                    maxScore: agg.maxScore,
                    attemptsCount: 1,
                    bestScore: agg.score,
                    percentage: localPercentage,
                    lastQuizAt: updatedUserQuiz.completedAt ?? doneAt,
                },
            });

            // recalcul du pourcentage global + bestScore
            const globalPercentage =
                ujc.maxScore > 0 ? (ujc.currentScore / ujc.maxScore) * 100 : 0;

            await tx.userJobCompetency.update({
                where: {id: ujc.id},
                data: {
                    percentage: globalPercentage,
                    bestScore: ujc.bestScore < agg.score ? agg.score : ujc.bestScore,
                },
            });

            // Créer l'entrée d’historique pour CE quiz et CETTE compétence
            await tx.userJobCompetencyHistory.create({
                data: {
                    userJobCompetencyId: ujc.id,
                    userQuizId: updatedUserQuiz.id,
                    score: agg.score,
                    maxScore: agg.maxScore,
                    percentage: localPercentage,
                    createdAt: updatedUserQuiz.completedAt ?? doneAt,
                },
            });
        }

        // 6. Update des diamants
        await tx.user.update({
            where: {id: userId},
            data: {
                diamonds: {
                    increment: totalScore + bonusPoints,
                },
            },
        });

        // 7. Mettre à jour les JobKiviats utilisateur + historique
        const allFamilies = jobForStats.competenciesFamilies;
        for (const family of allFamilies) {
            const familyId = family.id;
            const currentAgg = familyAgg.get(familyId) ?? {score: 0, maxScore: 0};
            const familyPercentage = currentAgg.maxScore > 0 ? (currentAgg.score / currentAgg.maxScore) * 100 : 0;
            const value = Math.max(0, Math.min(5, familyPercentage / 20));
            const JuniorValue = (await tx.jobKiviat.findUnique({
                where: {
                    jobId_competenciesFamilyId_level: {
                        jobId: jobForStats.id,
                        competenciesFamilyId: familyId,
                        level: JobProgressionLevel.JUNIOR,
                    },
                },
                select: {value: true},
            }))?.value ?? 0;
            const MidLevelValue = (await tx.jobKiviat.findUnique({
                where: {
                    jobId_competenciesFamilyId_level: {
                        jobId: jobForStats.id,
                        competenciesFamilyId: familyId,
                        level: JobProgressionLevel.MIDLEVEL,
                    },
                },
                select: {value: true},
            }))?.value ?? 0;
            const SeniorValue = (await tx.jobKiviat.findUnique({
                where: {
                    jobId_competenciesFamilyId_level: {
                        jobId: jobForStats.id,
                        competenciesFamilyId: familyId,
                        level: JobProgressionLevel.SENIOR,
                    },
                },
                select: {value: true},
            }))?.value ?? 0;

            const level: JobProgressionLevel = value <= JuniorValue ? JobProgressionLevel.JUNIOR
                : value <= MidLevelValue ? JobProgressionLevel.MIDLEVEL
                    : value <= SeniorValue ? JobProgressionLevel.SENIOR
                        : JobProgressionLevel.EXPERT;

            const userJobKiviat = await tx.userJobKiviat.upsert({
                where: {
                    userJobId_competenciesFamilyId: {
                        userJobId: userJob.id,
                        competenciesFamilyId: familyId,
                    },
                },
                update: {
                    value,
                    level,
                },
                create: {
                    userJobId: userJob.id,
                    competenciesFamilyId: familyId,
                    value,
                    level,
                },
                include: {histories: false},
            });

            await tx.userJobKiviatHistory.create({
                data: {
                    value,
                    percentage: familyPercentage,
                    createdAt: updatedUserQuiz.completedAt ?? doneAt,
                    userJobKiviat: {
                        connect: {id: userJobKiviat.id},
                    },
                    userQuiz: {
                        connect: {id: updatedUserQuiz.id},
                    }
                },
            });
        }

        return {updatedUserQuiz, userJobId: userJob.id, wasAlreadyCompleted};
    });

    if (!wasAlreadyCompleted) {
        await trackEvent(
            userJobId,
            'QUIZ_COMPLETED',
            {
                quizType: updatedUserQuiz.type,
                score: updatedUserQuiz.percentage ?? 0,
                completedAt: updatedUserQuiz.completedAt ?? undefined,
            },
            timezone,
        );
    }

    const quizResult = await generateNextQuiz(updatedUserQuiz, userJobId, userId, jobId);

    let generatedArticle = null;
    try {
        generatedArticle = await generateMarkdownArticleForLastQuiz(userJobId, userId);
    } catch (err) {
        console.error('Failed to auto-generate markdown article after quiz completion', err);
    }

    return {...quizResult, generatedArticle};
};


export type UserJobRankingRow = {
    userJobId: string;
    userId: string;
    firstname: string | null;
    lastname: string | null;
    jobId: string;
    jobTitle: string;
    totalScore: number;
    maxScoreSum: number;
    percentage: number;
    completedQuizzes: number;
    lastQuizAt: Date | null;
    rank: number;
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

export async function getRankingForJob({jobId, from, to,}: GetRankingForJobParams): Promise<UserJobRankingRow[]> {
    const resolved = await resolveJobOrFamilyId(jobId);
    if (resolved.scope === UserJobScope.JOB_FAMILY) {
        throw new Error('Ranking is only supported for job tracks.');
    }

    // fragments pour la période
    const fromFilter =
        from ? Prisma.sql`AND uq."completedAt" >= ${from}::timestamp` : Prisma.empty;
    const toFilter =
        to ? Prisma.sql`AND uq."completedAt" < ${to}::timestamp` : Prisma.empty;

    // language=SQL format=false
    const rows = await prisma.$queryRaw<UserJobRankingRow[]>`
        SELECT
            uj.id AS "userJobId",
            uj."userId",
            u.firstname,
            u.lastname,
            uj."jobId",
            j.title AS "jobTitle",

            -- CAST en INTEGER pour éviter les bigint sur SUM:contentReference[oaicite:4]{index=4}.
            COALESCE(CAST(SUM(uq."totalScore") AS INTEGER), 0) AS "totalScore",
            COALESCE(CAST(SUM(uq."maxScore")   AS INTEGER), 0) AS "maxScoreSum",

            -- Pourcentage : conversion en double precision puis round sur numeric:contentReference[oaicite:5]{index=5}.
            CASE
                WHEN COALESCE(SUM(uq."maxScore"), 0) > 0
                    THEN
                    ROUND(
                            (
                                100.0
                                    * COALESCE(SUM(uq."totalScore")::double precision, 0)
                                    / NULLIF(
                                        COALESCE(SUM(uq."maxScore")::double precision, 0),
                                        0
                                      )
                                )::numeric,
                            2
                    )::double precision
        ELSE 0
        END AS "percentage",

      -- CAST en INTEGER pour éviter bigint sur COUNT:contentReference[oaicite:6]{index=6}.
      COALESCE(CAST(COUNT(uq.id) AS INTEGER), 0) AS "completedQuizzes",

      -- Date du dernier quiz complété (peut être NULL).
      MAX(uq."completedAt") AS "lastQuizAt",

      -- RANG : cast en INTEGER car rank() → bigint:contentReference[oaicite:7]{index=7}.
      CAST(
        RANK() OVER (
          PARTITION BY uj."jobId"
          ORDER BY
            COALESCE(SUM(uq."totalScore"), 0) DESC,
            MAX(uq."completedAt") ASC
        )
        AS INTEGER
      ) AS "rank"

    FROM "UserJob" uj
    JOIN "User" u ON u.id = uj."userId"
    JOIN "Job" j ON j.id = uj."jobId"

    -- LEFT JOIN pour inclure les utilisateurs sans quiz complété.
    LEFT JOIN "UserQuiz" uq
      ON uq."userJobId" = uj.id
      AND uq.status = 'COMPLETED'
        ${fromFilter}
        ${toFilter}

        WHERE uj."jobId" = ${resolved.jobId!}::uuid
        GROUP BY
        uj.id,
        uj."userId",
        u.firstname,
        u.lastname,
        uj."jobId",
        j.title;
    `;
    return rows;
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
    level: string; // JobProgressionLevel en string
    value: any;
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
                value: row.value,
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
