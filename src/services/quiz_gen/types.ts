// src/quiz/types.ts
import {
    LeagueTier,
    Level,
    QuizQuestionType,
    JobProgressionLevel,
} from "@prisma/client";

export interface LlmUserContext {
    id: string;
    leagueTier: LeagueTier;
    leaguePoints: number;
    winningStreak: number;
}

export interface LlmJobFamily {
    id: string;
    slug: string;
    name: string;
}

export interface LlmJobCompetency {
    id: string;
    slug: string;
    name: string;
    type: "HARD_SKILL" | "SOFT_SKILL";
    level: Level;
    familySlug: string;
    subFamilySlug?: string | null;
}

export interface LlmJobContext {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    families: LlmJobFamily[];
    competencies: LlmJobCompetency[];
}

export interface LlmQuizResponseOption {
    id: string;
    text: string;
    isCorrect: boolean;
    index: number;
}

export interface LlmUserAnswer {
    isCorrect: boolean;
    timeToAnswer: number;
    chosenResponseIds: string[];
    freeTextAnswer?: string | null;
    score?: number | null;
}

export interface LlmQuizQuestionHistory {
    id: string;
    text: string;
    competencyId: string;
    competencySlug: string | null;
    competencyName: string | null;
    familySlug: string | null;
    subFamilySlug: string | null;
    level: Level;
    type: QuizQuestionType;
    timeLimitInSeconds: number;
    index: number;
    responses: LlmQuizResponseOption[];
    userAnswer: LlmUserAnswer | null;
}

export interface LlmUserQuizHistory {
    userQuizId: string;
    quizId: string;
    type: "POSITIONING" | "DAILY";
    assignedAt: string;
    startedAt: string | null;
    completedAt: string | null;
    totalScore: number;
    maxScore: number;
    percentage: number | null;
    quizLevel: Level;
    quizTitle: string | null;
    quizDescription: string | null;
    questions: LlmQuizQuestionHistory[];
}

export interface CompetencyPerformanceSummary {
    competencyId: string;
    competencySlug: string;
    competencyName: string;
    type: "HARD_SKILL" | "SOFT_SKILL";
    familyId: string;
    familySlug: string;
    familyName: string;
    subFamilyId: string;
    subFamilySlug: string;
    attemptsLast5Quizzes: number;
    correctCount: number;
    wrongCount: number;
    successRate: number;      // 0.0 – 1.0
    avgTimeToAnswer: number;  // en secondes
    lastSeenAt: string | null;
    difficultyHistogram: {
        EASY: number;
        MEDIUM: number;
        HARD: number;
        EXPERT: number;
    };
    globalStats?: {
        percentage: number;
        attemptsCount: number;
        bestScore: number;
        level: Level | null;
    };
}

export interface FamilyPerformanceSummary {
    familyId: string;
    familySlug: string;
    familyName: string;
    userKiviatValue: number | null;   // 1.0 – 5.0
    targetKiviatValue: number | null; // 1.0 – 5.0 (pour un JobProgressionLevel)
    questionsCountLast5Quizzes: number;
    successRateLast5Quizzes: number;  // 0.0 – 1.0
    avgQuestionLevel: Level;
}

export interface GenerationParameters {
    numberOfQuestions: number;
    allowedQuestionTypes: QuizQuestionType[];
    targetDifficultyDistribution?: Partial<Record<Level, number>>;
    focusWeakCompetenciesRatio: number;        // ex: 0.6
    includeStrongForReviewRatio: number;       // ex: 0.2
    avoidQuestionIds?: string[];
    targetJobProgressionLevel: JobProgressionLevel;
}

export interface GenerateQuizInput {
    user: LlmUserContext;
    job: LlmJobContext;
    last5Quizzes: LlmUserQuizHistory[];
    competencySummaries: CompetencyPerformanceSummary[];
    familySummaries: FamilyPerformanceSummary[];
    generationParameters: GenerationParameters;
}
