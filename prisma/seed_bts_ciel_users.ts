/* eslint-disable no-console */
import {QuizQuestionType, QuizType} from '@prisma/client';
import {prisma} from '../src/config/db';
import {register} from '../src/services/auth.services';
import {
    retrieveDailyQuizForJob,
    saveQuizAnswersAndComplete,
    setCurrentUserJobFamily,
} from '../src/services/user_jobs.services';
import {getRedisClient} from '../src/config/redis';

const JOB_FAMILY_NAME = 'BTS Ciel';
const TIMEZONE = 'Europe/Paris';
const LOCALE = 'fr';

const USERS = [
    {
        email: 'sebastien.biney@murya.app',
        password: 'SeedBtsCiel#1',
        firstname: 'Sébastien',
        lastname: 'Biney',
    },
    {
        email: 'jonathan.dahissiho@murya.app',
        password: 'SeedBtsCiel#2',
        firstname: 'Jonathan',
        lastname: 'Dahissiho',
    },
    {
        email: 'arnaud.lissajoux@murya.app',
        password: 'SeedBtsCiel#3',
        firstname: 'Arnaud',
        lastname: 'Lissajoux',
    },
];

const randomInt = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

const pickOne = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

const shuffle = <T>(items: T[]) => {
    const cloned = [...items];
    for (let i = cloned.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
    }
    return cloned;
};

const buildQuestionsFromQuiz = (quiz: any) => {
    if (Array.isArray(quiz?.questions) && quiz.questions.length > 0) {
        return quiz.questions;
    }
    if (Array.isArray(quiz?.items) && quiz.items.length > 0) {
        return quiz.items.map((item: any) => ({
            ...item.question,
            timeLimitInSeconds: item.timeLimitOverrideS ?? item.question?.defaultTimeLimitS ?? 0,
        }));
    }
    return [];
};

type AnswerStrategy = 'random' | 'correct' | 'incorrect';

const buildAnswerPayload = (
    quiz: any,
    strategyByQuestionId?: Map<string, AnswerStrategy>,
    defaultStrategy: AnswerStrategy = 'random',
) => {
    const questions = buildQuestionsFromQuiz(quiz);
    if (!questions.length) {
        throw new Error('Aucune question disponible pour le quiz.');
    }

    return questions.map((question: any) => {
        const responses = Array.isArray(question.responses)
            ? (question.responses as Array<{id: string; isCorrect?: boolean}>)
            : [];
        const responseIds: string[] = [];
        let freeTextAnswer: string | undefined;
        const strategy = strategyByQuestionId?.get(question.id) ?? defaultStrategy;

        switch (question.type) {
            case QuizQuestionType.single_choice:
            case QuizQuestionType.true_false: {
                if (!responses.length) {
                    throw new Error(`Reponses manquantes pour la question ${question.id}`);
                }
                if (strategy === 'correct') {
                    const correct = responses.find((r) => r.isCorrect);
                    responseIds.push((correct ?? responses[0]).id);
                } else if (strategy === 'incorrect') {
                    const incorrect = responses.find((r) => !r.isCorrect);
                    responseIds.push((incorrect ?? responses[0]).id);
                } else {
                    responseIds.push(pickOne(responses).id);
                }
                break;
            }
            case QuizQuestionType.multiple_choice: {
                if (!responses.length) {
                    throw new Error(`Reponses manquantes pour la question ${question.id}`);
                }
                const correctIds = responses.filter((r) => r.isCorrect).map((r) => r.id);
                if (strategy === 'correct') {
                    responseIds.push(...correctIds);
                } else if (strategy === 'incorrect') {
                    const incorrectResponses = responses.filter((r) => !r.isCorrect);
                    if (incorrectResponses.length) {
                        responseIds.push(pickOne(incorrectResponses).id);
                    } else if (correctIds.length > 1) {
                        responseIds.push(...correctIds.slice(0, correctIds.length - 1));
                    } else {
                        responseIds.push(...correctIds);
                    }
                } else {
                    const subsetSize = randomInt(1, responses.length);
                    responseIds.push(...shuffle(responses).slice(0, subsetSize).map((r) => r.id));
                }
                break;
            }
            case QuizQuestionType.short_answer:
            case QuizQuestionType.fill_in_the_blank: {
                const accepted = Array.isArray(question.metadata?.acceptedAnswers)
                    ? question.metadata.acceptedAnswers
                    : [];
                if (strategy === 'correct') {
                    freeTextAnswer = accepted.length
                        ? String(pickOne(accepted))
                        : `reponse-${Math.random().toString(36).slice(2, 8)}`;
                } else if (strategy === 'incorrect') {
                    const fallback = `reponse-${Math.random().toString(36).slice(2, 8)}`;
                    if (!accepted.length) {
                        freeTextAnswer = fallback;
                    } else {
                        let candidate = fallback;
                        const normalizedAccepted = accepted.map((value: string) => String(value).trim().toLowerCase());
                        while (normalizedAccepted.includes(candidate.trim().toLowerCase())) {
                            candidate = `reponse-${Math.random().toString(36).slice(2, 8)}`;
                        }
                        freeTextAnswer = candidate;
                    }
                } else {
                    const useAccepted = accepted.length > 0 && Math.random() < 0.6;
                    freeTextAnswer = useAccepted
                        ? String(pickOne(accepted))
                        : `reponse-${Math.random().toString(36).slice(2, 8)}`;
                }
                break;
            }
            default: {
                if (responses.length) {
                    if (strategy === 'correct') {
                        const correct = responses.find((r) => r.isCorrect);
                        responseIds.push((correct ?? responses[0]).id);
                    } else if (strategy === 'incorrect') {
                        const incorrect = responses.find((r) => !r.isCorrect);
                        responseIds.push((incorrect ?? responses[0]).id);
                    } else {
                        responseIds.push(pickOne(responses).id);
                    }
                } else {
                    freeTextAnswer = `reponse-${Math.random().toString(36).slice(2, 8)}`;
                }
            }
        }

        const baseLimit =
            Number(question.timeLimitInSeconds ?? question.defaultTimeLimitS ?? 20) || 20;
        const timeToAnswer = Math.max(1, Math.round(baseLimit * (0.3 + Math.random())));

        return {
            questionId: question.id,
            responseIds,
            freeTextAnswer,
            timeToAnswer,
        };
    });
};

const ensureSeedUser = async (
    email: string,
    password: string,
    firstname: string,
    lastname: string,
) => {
    const existing = await prisma.user.findUnique({
        where: {email},
    });
    const user = existing ?? await register(email, undefined, undefined, password);

    if (user.firstname !== firstname || user.lastname !== lastname) {
        return prisma.user.update({
            where: {id: user.id},
            data: {firstname, lastname},
        });
    }

    return user;
};

export async function seedBtsCielUsers() {
    const jobFamily = await prisma.jobFamily.findFirst({
        where: {name: JOB_FAMILY_NAME},
        select: {id: true, name: true},
    });
    if (!jobFamily) {
        throw new Error(`Famille de metiers introuvable: ${JOB_FAMILY_NAME}`);
    }

    const canGenerateDaily = Boolean(
        process.env.QUIZ_GENERATION_URL
        || process.env.QUIZ_AGENT_URL
        || getRedisClient(),
    );

    for (const userSeed of USERS) {
        const user = await ensureSeedUser(
            userSeed.email,
            userSeed.password,
            userSeed.firstname,
            userSeed.lastname,
        );
        await setCurrentUserJobFamily(user.id, jobFamily.id, LOCALE);

        const targetQuizzes = randomInt(1, 5);
        const quizzesToComplete = canGenerateDaily ? targetQuizzes : Math.min(targetQuizzes, 4);
        const isJonathan = userSeed.email === 'jonathan.dahissiho@murya.app';

        let strategyByQuestionId: Map<string, AnswerStrategy> | undefined;
        if (isJonathan) {
            await retrieveDailyQuizForJob(jobFamily.id, user.id, LOCALE);
            const userJob = await prisma.userJob.findUnique({
                where: {userId_jobFamilyId: {userId: user.id, jobFamilyId: jobFamily.id}},
                select: {id: true},
            });
            if (!userJob) {
                throw new Error('UserJob introuvable pour le seed BTS Ciel (Jonathan).');
            }
            const assigned = await prisma.userQuiz.findMany({
                where: {userJobId: userJob.id, type: QuizType.POSITIONING, isActive: true},
                orderBy: {index: 'asc'},
                take: quizzesToComplete,
                include: {
                    quiz: {
                        include: {
                            items: {
                                include: {
                                    question: {include: {responses: true}},
                                },
                            },
                        },
                    },
                },
            });
            const questionsWithPoints: Array<{questionId: string; points: number}> = [];
            for (const uq of assigned) {
                for (const item of uq.quiz.items) {
                    const points = item.pointsOverride ?? item.question.defaultPoints ?? 0;
                    if (points > 0) {
                        questionsWithPoints.push({questionId: item.questionId, points});
                    }
                }
            }
            const totalMaxScore = questionsWithPoints.reduce((sum, q) => sum + q.points, 0);
            let wrongPointsTarget = Math.round(totalMaxScore * 0.05);
            if (totalMaxScore >= 20 && wrongPointsTarget === 0) {
                wrongPointsTarget = 1;
            }
            const sorted = [...questionsWithPoints].sort((a, b) => a.points - b.points);
            const wrongIds = new Set<string>();
            let remaining = wrongPointsTarget;
            for (const entry of sorted) {
                if (remaining <= 0) break;
                wrongIds.add(entry.questionId);
                remaining -= entry.points;
            }
            strategyByQuestionId = new Map<string, AnswerStrategy>(
                questionsWithPoints.map((q) => [q.questionId, 'correct']),
            );
            for (const qid of wrongIds) {
                strategyByQuestionId.set(qid, 'incorrect');
            }
        }

        if (quizzesToComplete < targetQuizzes) {
            console.log(
                `WARN ${userSeed.email}: ${targetQuizzes} demandes, reduit a ${quizzesToComplete} (generation quotidienne non configuree).`,
            );
        }

        for (let i = 0; i < quizzesToComplete; i += 1) {
            const quiz = await retrieveDailyQuizForJob(jobFamily.id, user.id, LOCALE);
            if (!quiz) {
                throw new Error(`Quiz introuvable pour ${userSeed.email} (index ${i + 1}).`);
            }
            const answers = buildAnswerPayload(
                quiz,
                strategyByQuestionId,
                isJonathan ? 'correct' : 'random',
            );
            const doneAt = new Date(Date.now() - (quizzesToComplete - i) * 60 * 60 * 1000).toISOString();
            await saveQuizAnswersAndComplete(jobFamily.id, quiz.id, user.id, answers, doneAt, TIMEZONE, LOCALE);
        }

        console.log(`Seeded ${quizzesToComplete} quizzes pour ${userSeed.email}`);
    }

    console.log('Seed BTS Ciel users termine');
}

if (require.main === module) {
    seedBtsCielUsers()
    .catch((err) => {
        console.error('Seed BTS Ciel users failed', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
}
