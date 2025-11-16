import {Prisma, Quiz, UserJobStatus, UserQuiz, UserQuizStatus, UserQuizType} from '@prisma/client';
import {prisma} from "../config/db";

// getCurrentUserJob
export async function getCurrentUserJob(userId: any) {
    const userJob = await prisma.userJob.findFirst({
        where: {userId, status: UserJobStatus.CURRENT},
        include: {
            job: true,
        },
    });

    if (!userJob) {
        throw new Error('Current UserJob not found');
    }

    return userJob;
}

export async function getUserJob(jobId: string, userId: any) {
    const userJob = await prisma.userJob.findUnique({
        where: {userId_jobId: {userId, jobId}},
        include: {
            job: true,
        },
    });

    if (!userJob) {
        throw new Error('UserJob not found');
    }

    return userJob;
}


export const retrievePositioningQuizForJob = async (userJob: any, userId: string): Promise<Quiz> => {
    const job = await prisma.userJob.findUnique({
        where: {id: userJob.id},
        select: {
            id: true,
            quizzes: true,
        },
    });
    if (!job) {
        throw new Error('Job not found');
    }

    // const quizzes = job.q || [];

    const quizzes = job.quizzes || [];
    const currentIndex = userJob.completedQuizzes || 0;
    if (currentIndex >= quizzes.length) {
        throw new Error('No more positioning quizzes available for this job');
    }

    const positioningQuiz = quizzes.find((q) => q.index === currentIndex);

    if (!positioningQuiz) {
        throw new Error('Positioning quiz not found for the current index');
    }

    return await prisma.quiz.findUnique({
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
    }) as Quiz;
};

// retrieveDailyQuizForJob
export const retrieveDailyQuizForJob = async (jobId: string, userId: string): Promise<Quiz | undefined | null> => {


    // check if user has completed the positioning quiz for the job, if not, return then positioningQuiz
    let userJob: any = await prisma.userJob.findUnique({
        where: {userId_jobId: {userId, jobId}},
        select: {quizzes: true, completedQuizzes: true, id: true},
    });
    if (!userJob) {
        // create the userJob entry?
        userJob = await prisma.userJob.create({
            data: {userId, jobId},
        });
        if (!userJob) {
            throw new Error('Failed to create userJob entry');
        }

        const jobQuizzes = (await prisma.job.findUnique({
                where: {id: jobId},
                select: {
                    quizzes: {
                        select: {
                            id: true,
                            questions: {
                                select: {
                                    points: true,
                                }
                            },
                        }
                    }
                }
            }
        ))?.quizzes;
        if (!jobQuizzes || jobQuizzes.length === 0) {
            throw new Error('No quizzes available for this job');
        }

        // check if user has any assigned quizzes for this job
        let userQuizzes = await prisma.userQuiz.findMany({
            where: {userJobId: userJob.id},
        });

        if (userQuizzes.length === 0) {
            // create the userQuiz entries
            let index = 0;
            for (const quiz of jobQuizzes) {
                const userQuiz = await prisma.userQuiz.create({
                    data: {
                        userJobId: userJob.id,
                        quizId: quiz.id,
                        type: UserQuizType.POSITIONING,
                        status: UserQuizStatus.ASSIGNED,
                        index: index++,
                        maxScore: quiz.questions.reduce((sum, q) => sum + q.points, 0),
                    }
                });
                userQuizzes.push(userQuiz);
            }
            // link the userQuizzes to userJob
            userJob = await prisma.userJob.update({
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

    const completedPositioningQuiz = userJob.completedQuizzes >= 5;
    if (!completedPositioningQuiz) {
        return await retrievePositioningQuizForJob(userJob, userId);
    }

    // If positioning quiz is completed, return the generated daily quiz for the job
    const dailyQuiz = userJob.quizzes.find(
        (uq: UserQuiz) => uq.type === UserQuizType.DAILY && uq.status === UserQuizStatus.ASSIGNED
    );
    if (!dailyQuiz) {
        return null;
    }
    const quiz = await prisma.quiz.findUnique({
        where: {id: dailyQuiz.quizId},
    });
    if (!quiz) {
        throw new Error('Daily quiz not found');
    }
    return quiz;
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

export const saveUserQuizAnswers = async (
    jobId: string,
    userQuizId: string,
    userId: string,
    answers: AnswerInput[],
    doneAt: string,
) => {
    const result = await prisma.$transaction(async (tx: any) => {
        // 0. Récupérer le UserJob
        const userJob = await tx.userJob.findUnique({
            where: {userId_jobId: {userId, jobId}},
            select: {id: true},
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
                                // pas besoin d'inclure competency ici, competencyId est déjà un champ scalaire de QuizQuestion
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
            userQuiz.quiz.questions.map((q) => [q.id, q])
        );

        // 2. Supprimer les anciennes réponses
        await tx.userQuizAnswer.deleteMany({
            where: {userQuizId: userQuiz.id},
        });

        let totalScore = 0;
        let bonusPoints = 0;
        const maxScore = userQuiz.quiz.questions.reduce(
            (sum, q) => sum + q.points,
            0
        );
        const maxScoreWithBonus = userQuiz.quiz.questions.reduce(
            (sum, q) => sum + q.points + q.timeLimitInSeconds,
            0
        );

        // *** NOUVEAU : agrégation par compétence pour CE quiz ***
        const competencyAgg = new Map<
            string,
            { score: number; maxScore: number }
        >();

        // 3. Créer les réponses
        for (const rawAnswer of answers) {
            const question = questionMap.get(rawAnswer.questionId);
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
                const correctResponses = question.responses.filter((r) => r.isCorrect);
                const correctIds = correctResponses.map((r) => r.id);

                const selectedSet = new Set(responseIds);
                const correctSet = new Set(correctIds);

                const sameSize = selectedSet.size === correctSet.size;
                const allCorrectIncluded = correctIds.every((id) =>
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

        return updatedUserQuiz;
    });

    return result;
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
};

export async function getRankingForJob({
                                           jobId,
                                           from,
                                           to,
                                       }: GetRankingForJobParams): Promise<UserJobRankingRow[]> {
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
        normalizedName: string;
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
        normalizedName: string;
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
};

export const getUserJobCompetencyProfile = async (
    userId: string,
    jobId: string
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
                    normalizedName: true,
                    description: true,
                    competenciesFamilies: {
                        select: {id: true, name: true},
                    },
                },
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
                    normalizedName: true,
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
            normalizedName: ujc.competency.normalizedName,
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
            title: userJob.job.title,
            normalizedName: userJob.job.normalizedName,
            description: userJob.job.description,
            competencyFamilies: userJob.job.competenciesFamilies.map((f) => ({
                id: f.id,
                name: f.name,
            })),
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
        competencies,
    };

    return profile;
};