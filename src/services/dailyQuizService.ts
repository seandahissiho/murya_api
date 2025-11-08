// src/services/dailyQuizService.ts

import {
    PrismaClient,
    UserJobStatus,
    UserQuizStatus,
    QuizQuestionType,
} from '@prisma/client';

import type {
    User,
    Job,
    UserQuiz,
    UserJob,
} from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Shape of a question produced by your AI.
 * You will adapt generateQuizForUserJob() to actually call OpenAI or whatever.
 */
type GeneratedQuizResponse = {
    text: string;
    isCorrect: boolean;
    points?: number; // optional, fallback handled in code
};

type GeneratedQuizQuestion = {
    text: string;
    type?: QuizQuestionType;      // default: single_choice
    timeLimitInSeconds?: number;  // default: 30
    points?: number;              // default: 1
    mediaUrl?: string;            // default: ""
    responses: GeneratedQuizResponse[];
};

type GeneratedQuiz = {
    questions: GeneratedQuizQuestion[];
};

type EnsureDailyQuizzesOptions = {
    date?: Date;        // for tests; in prod, just let default new Date()
    timezone?: string;  // if you want to handle timezone explicitly later
};

export class DailyQuizService {
    constructor(private prisma: PrismaClient) {}

    /**
     * Main entry point.
     * Call this after a successful login.
     *
     * - It looks at all UserJob with status TARGET or CURRENT.
     * - For each, it checks whether a UserQuiz already exists for "today".
     * - If not, it generates and persists a new Quiz + UserQuiz.
     *
     * Returns the list of newly created UserQuiz rows.
     */
    async ensureDailyQuizzesForUser(
        userId: string,
        options: EnsureDailyQuizzesOptions = {},
    ): Promise<UserQuiz[]> {
        const now = options.date ?? new Date();
        const { startOfDay, endOfDay } = this.getDayBounds(now);

        // 1) Fetch active jobs for this user
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
            // User has no target/current jobs → no quiz to generate
            return [];
        }

        const userJobIds = userJobs.map((uj) => uj.id);

        // 2) Find which UserJobs already have a quiz for today
        const existingToday = await this.prisma.userQuiz.findMany({
            where: {
                userJobId: { in: userJobIds },
                assignedAt: {
                    gte: startOfDay,
                    lt: endOfDay,
                },
            },
            select: {
                userJobId: true,
            },
        });

        const alreadyGeneratedFor = new Set(
            existingToday.map((uq) => uq.userJobId),
        );

        // 3) For each UserJob without a quiz today, generate one
        const createdUserQuizzes: UserQuiz[] = [];

        for (const userJob of userJobs) {
            if (alreadyGeneratedFor.has(userJob.id)) {
                // Quiz already exists for this job today → skip
                continue;
            }

            // Fetch user and job if you want more context for AI
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
            });
            if (!user) {
                // Shouldn't happen, but be defensive
                continue;
            }

            // 3.a) Generate quiz content with AI (currently just a placeholder)
            const generatedQuiz = await this.generateQuizForUserJob(user, userJob.job);

            // 3.b) Persist Quiz + Questions + Responses
            const quiz = await this.createQuizFromGenerated(generatedQuiz);

            // 3.c) Create UserQuiz row linking userJob + quiz
            const userQuiz = await this.prisma.userQuiz.create({
                data: {
                    userJobId: userJob.id,
                    quizId: quiz.id,
                    status: UserQuizStatus.ASSIGNED,
                    assignedAt: now,
                },
            });

            createdUserQuizzes.push(userQuiz);
        }

        return createdUserQuizzes;
    }

    /**
     * Helper to compute today's bounds.
     * Here we do it in server local time; if you care about the user's timezone,
     * you can adapt this to use e.g. date-fns-tz.
     */
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

    /**
     * Placeholder for your AI logic.
     * Right now it returns a dumb static quiz so you can test the flow.
     *
     * Replace this with a call to OpenAI (or other provider) based on:
     * - user profile
     * - job title / competencies
     * - previous quizzes results, etc.
     */
    private async generateQuizForUserJob(
        user: User,
        job: Job,
    ): Promise<GeneratedQuiz> {
        // TODO: replace with real AI generation.
        // This is only an example structure.
        return {
            questions: [
                {
                    text: `Basic question for job "${job.title}"`,
                    type: QuizQuestionType.single_choice,
                    timeLimitInSeconds: 30,
                    points: 1,
                    responses: [
                        { text: 'Correct answer', isCorrect: true, points: 1 },
                        { text: 'Wrong answer', isCorrect: false, points: 0 },
                    ],
                },
                {
                    text: `Another question for "${job.title}"`,
                    type: QuizQuestionType.true_false,
                    timeLimitInSeconds: 20,
                    points: 1,
                    responses: [
                        { text: 'True', isCorrect: true, points: 1 },
                        { text: 'False', isCorrect: false, points: 0 },
                    ],
                },
            ],
        };
    }

    /**
     * Takes a GeneratedQuiz (from AI) and saves it into the DB
     * using your Quiz / QuizQuestion / QuizResponse models.
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
                                // If points for the response is not specified,
                                // default to question points for correct answers, 0 for wrong.
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
