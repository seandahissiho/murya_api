// src/services/quizAssignmentService.ts

import {
    PrismaClient,
    UserJobStatus,
    UserQuizStatus,
    UserQuizType,
    QuizQuestionType,
} from '@prisma/client';

import type { User, Job, UserQuiz } from '@prisma/client';

// Types coming from AI
type GeneratedQuizResponse = {
    text: string;
    isCorrect: boolean;
    points?: number;
};

type GeneratedQuizQuestion = {
    text: string;
    type?: QuizQuestionType;
    timeLimitInSeconds?: number;
    points?: number;
    mediaUrl?: string;
    responses: GeneratedQuizResponse[];
};

type GeneratedQuiz = {
    questions: GeneratedQuizQuestion[];
};

type AssignQuizzesOptions = {
    date?: Date;       // for tests
    timezone?: string; // if you later want strict timezone handling
};

export class QuizAssignmentService {
    constructor(private prisma: PrismaClient) {}

    /**
     * Call this right after a successful login.
     *
     * For each active UserJob:
     *  1) If the job has a positioningQuizId:
     *     - If no COMPLETED positioning UserQuiz exists yet:
     *         -> ensure there is one ASSIGNED attempt and return it
     *         -> do NOT create daily quiz for this job
     *     - If COMPLETED:
     *         -> allowed to create DAILY quiz for today (if not already created)
     *
     *  2) If the job has no positioningQuizId:
     *     - direct DAILY logic (optional, you can also forbid that if you want).
     */
    async assignQuizzesForUserOnLogin(
        userId: string,
        options: AssignQuizzesOptions = {},
    ): Promise<UserQuiz[]> {
        const now = options.date ?? new Date();
        const { startOfDay, endOfDay } = this.getDayBounds(now);

        // 1. Fetch active UserJobs with their Job + positioningQuizId
        const userJobs = await this.prisma.userJob.findMany({
            where: {
                userId,
                status: { in: [UserJobStatus.TARGET, UserJobStatus.CURRENT] },
            },
            include: {
                job: true,
            },
        });

        if (userJobs.length === 0) {
            return [];
        }

        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return [];
        }

        const createdUserQuizzes: UserQuiz[] = [];

        for (const userJob of userJobs) {
            const job = userJob.job;

            // -------------------- 1) POSITIONING LOGIC --------------------

            if (job.positioningQuizId) {
                // 1.a. Check if there is a COMPLETED positioning quiz for this job
                const completedPositioning = await this.prisma.userQuiz.findFirst({
                    where: {
                        userJobId: userJob.id,
                        kind: UserQuizType.POSITIONING,
                        quizId: job.positioningQuizId,
                        status: UserQuizStatus.COMPLETED,
                    },
                });

                if (!completedPositioning) {
                    // No completed positioning yet -> ensure there is one ASSIGNED attempt

                    const existingPositioningAttempt =
                        await this.prisma.userQuiz.findFirst({
                            where: {
                                userJobId: userJob.id,
                                kind: UserQuizType.POSITIONING,
                                quizId: job.positioningQuizId,
                            },
                            orderBy: {
                                assignedAt: 'desc',
                            },
                        });

                    if (!existingPositioningAttempt) {
                        // Create the first attempt for this positioning quiz
                        const newPositioningUserQuiz = await this.prisma.userQuiz.create({
                            data: {
                                userJobId: userJob.id,
                                quizId: job.positioningQuizId,
                                kind: UserQuizType.POSITIONING,
                                status: UserQuizStatus.ASSIGNED,
                                assignedAt: now,
                            },
                        });

                        createdUserQuizzes.push(newPositioningUserQuiz);
                    }

                    // In all cases, positioning not completed -> no daily quiz yet
                    continue;
                }

                // If we reach here, positioning is completed for this user + job
                // -> proceed to DAILY logic below
            } else {
                // Job has no positioning quiz configured.
                // You can decide to:
                // - skip daily quizzes,
                // - or allow daily quizzes anyway.
                // Here we ALLOW daily quizzes even if no positioning quiz exists.
            }

            // -------------------- 2) DAILY QUIZ LOGIC --------------------

            const existingDailyToday = await this.prisma.userQuiz.findFirst({
                where: {
                    userJobId: userJob.id,
                    kind: UserQuizType.DAILY,
                    assignedAt: {
                        gte: startOfDay,
                        lt: endOfDay,
                    },
                },
            });

            if (existingDailyToday) {
                // Already created for today
                continue;
            }

            // Generate the daily quiz content with AI
            const generatedDailyQuiz =
                await this.generateDailyQuizForUserJob(user, job);

            // Persist the quiz template
            const dailyQuizTemplate = await this.createQuizFromGenerated(
                generatedDailyQuiz,
            );

            // Create the UserQuiz instance
            const dailyUserQuiz = await this.prisma.userQuiz.create({
                data: {
                    userJobId: userJob.id,
                    quizId: dailyQuizTemplate.id,
                    kind: UserQuizType.DAILY,
                    status: UserQuizStatus.ASSIGNED,
                    assignedAt: now,
                },
            });

            createdUserQuizzes.push(dailyUserQuiz);
        }

        return createdUserQuizzes;
    }

    // -------------------- Helpers --------------------

    private getDayBounds(date: Date): { startOfDay: Date; endOfDay: Date } {
        const startOfDay = new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
            0,
            0,
            0,
            0,
        );
        const endOfDay = new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate() + 1,
            0,
            0,
            0,
            0,
        );
        return { startOfDay, endOfDay };
    }

    // -------------------- AI DAILY QUIZ (ONLY) --------------------

    /**
     * Daily quiz generation for a given user + job.
     * Adapt this to your real AI logic (OpenAI, Anthropic, etc.).
     */
    private async generateDailyQuizForUserJob(
        user: User,
        job: Job,
    ): Promise<GeneratedQuiz> {
        // TODO: replace with real AI generation using
        // - job title
        // - competencies
        // - past quizzes, etc.

        return {
            questions: [
                {
                    text: `Question quotidienne pour le poste "${job.title}".`,
                    type: QuizQuestionType.single_choice,
                    timeLimitInSeconds: 30,
                    points: 1,
                    responses: [
                        { text: 'Bonne réponse', isCorrect: true, points: 1 },
                        { text: 'Mauvaise réponse', isCorrect: false, points: 0 },
                    ],
                },
            ],
        };
    }

    /**
     * Persist a GeneratedQuiz into Quiz / QuizQuestion / QuizResponse.
     * Returns the created Quiz template.
     */
    private async createQuizFromGenerated(
        generatedQuiz: GeneratedQuiz,
    ) {
        const quiz = await this.prisma.quiz.create({
            data: {
                questions: {
                    create: generatedQuiz.questions.map((q, questionIndex) => ({
                        text: q.text,
                        type: q.type ?? QuizQuestionType.single_choice,
                        timeLimitInSeconds: q.timeLimitInSeconds ?? 30,
                        points: q.points ?? 1,
                        mediaUrl: q.mediaUrl ?? '',
                        position: questionIndex,
                        responses: {
                            create: q.responses.map((r, responseIndex) => ({
                                text: r.text,
                                isCorrect: r.isCorrect,
                                points:
                                    r.points ??
                                    (r.isCorrect ? q.points ?? 1 : 0),
                                index: responseIndex,
                            })),
                        },
                    })),
                },
            },
        });

        return quiz;
    }
}
