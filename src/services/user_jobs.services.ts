import {
    Prisma,
    Quiz,
    QuizType,
    UserJobStatus,
    UserQuiz,
    UserQuizStatus,
    JobProgressionLevel,
    QuizQuestionType,
    Level,
    LeagueTier,
} from '@prisma/client';
import {prisma} from "../config/db";
import {resolveFields} from "../i18n/translate";
import {buildGenerateQuizInput} from "./quiz_gen/build-generate-quiz-input";
import {enqueueQuizGenerationJob, getRedisClient} from "../config/redis";
import {generateMarkdownArticleForLastQuiz} from "./generateMarkdownArticleForLastQuiz";

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
            job: true,
            kiviats: {
                include: {
                    competenciesFamily: true,
                    histories: {orderBy: {createdAt: 'asc'}},
                },
            },
        },
    });

    if (!userJob) return null;

    const localizedJob = await resolveFields({
        entity: 'Job',
        entityId: userJob.job.id,
        fields: ['title', 'description'],
        lang,
        base: userJob.job,
    });

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

    return {...userJob, job: localizedJob, kiviats};
}

export async function getUserJob(jobId: string, userId: any, lang: string = 'en') {
    const userJob = await prisma.userJob.findUnique({
        where: {userId_jobId: {userId, jobId}},
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

// retrieveDailyQuizForJob
export const retrieveDailyQuizForJob = async (jobId: string, userId: string, lang: string = 'en'): Promise<Quiz | undefined | null> => {


    // check if user has completed the positioning quiz for the job, if not, return then positioningQuiz
    let userJob: any = await prisma.userJob.findUnique({
        where: {userId_jobId: {userId, jobId}},
        select: {quizzes: true, completedQuizzes: true, id: true, jobId: true, userId: true},
    });
    if (!userJob) {
        // create the userJob entry?
        userJob = await prisma.userJob.create({
            data: {userId, jobId},
            select: {quizzes: true, completedQuizzes: true, id: true, jobId: true, userId: true},
        });
        if (!userJob) {
            throw new Error('Failed to create userJob entry');
        }

        await createUserQuizzesForJob(userJob.id, jobId, userId);
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
        },
    });

    // const quizzesCount = allQuizzes.length;
    const completedQuizzes = allQuizzes.filter(
        (q) => q.status === UserQuizStatus.COMPLETED
    ).length;
    const totalScoreSum = allQuizzes.reduce(
        (sum, q) => {
            const total = (q.totalScore ?? 0) + (q.bonusPoints ?? 0);
            return sum + total;
        },
        0
    );
    const maxScoreSum = allQuizzes.reduce((sum, q) => sum + q.maxScoreWithBonus, 0);

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

export async function generateAndPersistDailyQuiz(userId: string, jobId: string, userJobId: string) {
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
        select: {leagueTier: true},
    });
    if (!userJob) {
        throw new Error('UserJob introuvable pour la génération');
    }

    const payload = await buildGenerateQuizInput({
        userId,
        jobId,
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

    const job = await prisma.job.findUnique({
        where: {id: jobId},
        include: {competencies: true},
    });
    if (!job) {
        throw new Error('Job introuvable pour la génération');
    }

    const competencyMap = new Map<string, string>();
    job.competencies.forEach((c) => competencyMap.set(c.slug, c.id));

    const quiz = await prisma.quiz.create({
        data: {
            jobId,
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

export async function generateAdaptiveQuizForUserJob(userId: string, jobId: string, userJobId: string) {
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

    return await generateAndPersistDailyQuiz(userId, jobId, userJobId);
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
            await generateAdaptiveQuizForUserJob(userId, jobId, userJobId);
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
    lang: string = 'en',
) => {
    const {updatedUserQuiz, userJobId} = await prisma.$transaction(async (tx: any) => {
        // 0. Récupérer le UserJob
        const userJob = await tx.userJob.findUnique({
            where: {userId_jobId: {userId, jobId}},
            select: {id: true, jobId: true, job: {select: {competenciesFamilies: true}}},
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
        const allFamilies = userJob.job.competenciesFamilies;
        for (const family of allFamilies) {
            const familyId = family.id;
            const currentAgg = familyAgg.get(familyId) ?? {score: 0, maxScore: 0};
            const familyPercentage = currentAgg.maxScore > 0 ? (currentAgg.score / currentAgg.maxScore) * 100 : 0;
            const value = Math.max(0, Math.min(5, familyPercentage / 20));
            const JuniorValue = (await tx.jobKiviat.findUnique({
                where: {
                    jobId_competenciesFamilyId_level: {
                        jobId: userJob.jobId,
                        competenciesFamilyId: familyId,
                        level: JobProgressionLevel.JUNIOR,
                    },
                },
                select: {value: true},
            })).value;
            const MidLevelValue = (await tx.jobKiviat.findUnique({
                where: {
                    jobId_competenciesFamilyId_level: {
                        jobId: userJob.jobId,
                        competenciesFamilyId: familyId,
                        level: JobProgressionLevel.MIDLEVEL,
                    },
                },
                select: {value: true},
            })).value;
            const SeniorValue = (await tx.jobKiviat.findUnique({
                where: {
                    jobId_competenciesFamilyId_level: {
                        jobId: userJob.jobId,
                        competenciesFamilyId: familyId,
                        level: JobProgressionLevel.SENIOR,
                    },
                },
                select: {value: true},
            })).value;

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

        return {updatedUserQuiz, userJobId: userJob.id};
    });

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

export async function getRankingForJob({jobId, from, to,}: GetRankingForJobParams): Promise<UserJobRankingRow[]> {
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

        WHERE uj."jobId" = ${jobId}::uuid
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
    jobId: string,
    count = 5, // nombre de kiviats à renvoyer
): Promise<JobKiviatSnapshotsDto> {
    // 1) Familles du job dans un ordre fixe
    const families = await prisma.competenciesFamily.findMany({
        where: {
            jobs: {
                some: { id: jobId },
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
    jobId: string,
    lang: string = 'en'
): Promise<UserJobCompetencyProfile> => { // si tu veux typer strictement
// ) => {
    // 1. Récupérer le UserJob + user + job (et vérifier qu’il existe)
    const userJob = await prisma.userJob.findUnique({
        where: {
            userId_jobId: {
                userId,
                jobId,
            },
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
        kiviats: (await getLastKiviatSnapshotsForUserJob(userJob.id, jobId)),
    };

    return profile;
};
