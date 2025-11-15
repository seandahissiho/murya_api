import {Quiz, UserQuiz, UserQuizStatus, UserQuizType} from '@prisma/client';
import {prisma} from "../config/db";

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

export const saveUserQuizAnswers = async (
    jobId: string,
    userQuizId: string,
    userId: string,
    answers: AnswerInput[]
) => {
    // return prisma.$transaction(async (prisma) => {
    // 0. Récupérer le UserJob pour vérifier que ce quiz appartient bien à l’utilisateur
    const userJob = await prisma.userJob.findUnique({
        where: {userId_jobId: {userId, jobId}},
        select: {id: true},
    });
    if (!userJob) {
        throw new Error("Job introuvable pour cet utilisateur.");
    }

    // 1. Charger le UserQuiz + quiz + questions + réponses
    const userQuiz = await prisma.userQuiz.findUnique({
        where: {
            userJobId_quizId: {userJobId: userJob.id, quizId: userQuizId},
        },
        include: {
            quiz: {
                include: {
                    questions: {
                        include: {
                            responses: true,
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

    // 2. Supprimer les anciennes réponses si l’utilisateur refait le quiz
    await prisma.userQuizAnswer.deleteMany({
        where: {userQuizId: userQuiz.id},
    });
    // (UserQuizAnswerOption est en cascade sur la FK normalement)

    let totalScore = 0;
    let bonusPoints = 0;
    const maxScore = userQuiz.quiz.questions.reduce(
        (sum, q) => sum + q.points,
        0
    );
    const maxScoreWithBonus = userQuiz.quiz.questions.reduce(
        (sum, q) => sum + q.points + q.timeLimitInSeconds * 10,
        0
    );

    // 3. Créer les réponses
    for (const rawAnswer of answers) {
        const question = questionMap.get(rawAnswer.questionId);
        if (!question) {
            // Si l’UI envoie une questionId inconnue -> on ignore ou on throw
            // Ici je throw pour éviter les incohérences
            throw new Error(`Question inconnue: ${rawAnswer.questionId}`);
        }

        const responseIds = rawAnswer.responseIds ?? [];

        // 3.1 Calcul auto-correction pour les types à choix
        let isCorrect = false;
        let score = 0;

        if (
            question.type === "single_choice" ||
            question.type === "multiple_choice" ||
            question.type === "true_false"
        ) {
            const correctResponses = question.responses.filter((r) => r.isCorrect);
            const correctIds = correctResponses.map((r) => r.id);

            // Vérifier que l’ensemble des réponses cochées == ensemble des réponses correctes
            const selectedSet = new Set(responseIds);
            const correctSet = new Set(correctIds);

            const sameSize = selectedSet.size === correctSet.size;
            const allCorrectIncluded = correctIds.every((id) =>
                selectedSet.has(id)
            );

            isCorrect = sameSize && allCorrectIncluded;

            score = isCorrect ? question.points : 0;
            bonusPoints += isCorrect ? (question.timeLimitInSeconds - rawAnswer.timeToAnswer) * 10 : 0;
        } else {
            // short_answer / fill_in_the_blank
            // -> correction manuelle plus tard
            isCorrect = false;
            score = 0;
            bonusPoints += 0;
        }

        totalScore += score;

        // 3.2 Créer UserQuizAnswer
        const createdAnswer = await prisma.userQuizAnswer.create({
            data: {
                userQuizId: userQuiz.id,
                questionId: question.id,
                timeToAnswer: rawAnswer.timeToAnswer ?? 0,
                freeTextAnswer: rawAnswer.freeTextAnswer ?? null,
                isCorrect,
                score,
            },
        });

        // 3.3 Créer UserQuizAnswerOption pour chaque option cochée
        if (responseIds.length > 0) {
            await prisma.userQuizAnswerOption.createMany({
                data: responseIds.map((responseId) => ({
                    userQuizAnswerId: createdAnswer.id,
                    responseId,
                })),
            });
        }
    }

    const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

    // 4. Mettre à jour le UserQuiz (score + statut)
    const updatedUserQuiz = await prisma.userQuiz.update({
        where: {id: userQuiz.id},
        data: {
            totalScore,
            maxScore,
            bonusPoints,
            maxScoreWithBonus,
            percentage,
            status: "COMPLETED",
            completedAt: new Date(),
            startedAt: userQuiz.startedAt ?? new Date(),
        },
    });

    // 5. Recalculer les agrégats sur UserJob
    const allQuizzes = await prisma.userQuiz.findMany({
        where: {userJobId: userQuiz.userJobId},
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
        (q) => q.status === "COMPLETED"
    ).length;
    const totalScoreSum = allQuizzes.reduce(
        (sum, q) => sum + q.totalScore || 0 + q.bonusPoints || 0,
        0
    );
    const maxScoreSum = allQuizzes.reduce((sum, q) => sum + q.maxScoreWithBonus, 0);

    const lastQuizAt = allQuizzes.reduce<Date | null>((latest, q) => {
        if (!q.completedAt) return latest;
        if (!latest || q.completedAt > latest) return q.completedAt;
        return latest;
    }, null);

    await prisma.userJob.update({
        where: {id: userQuiz.userJobId},
        data: {
            // quizzesCount,
            completedQuizzes,
            totalScore: totalScoreSum,
            maxScoreSum,
            lastQuizAt,
        },
    });

    // 6. Update the user's diamonds based on the quiz results
    await prisma.user.update({
        where: {id: userId},
        data: {
            diamonds: {
                increment: totalScore + bonusPoints,
            },
        },
    });

    return updatedUserQuiz;
    // });
};