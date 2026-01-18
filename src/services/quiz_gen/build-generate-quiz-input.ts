// src/quiz/build-generate-quiz-input.ts
import {
    CompetencyType,
    JobProgressionLevel,
    Level,
    QuizQuestionType,
    UserQuizStatus,
} from "@prisma/client";
import { prisma } from "../../config/db";
import {
    GenerateQuizInput,
    GenerationParameters,
    LlmUserQuizHistory,
    LlmQuizQuestionHistory,
    CompetencyPerformanceSummary,
    FamilyPerformanceSummary,
    LlmJobCompetency,
} from "./types";

// Helpers pour les niveaux → nombre et inverse
const levelToWeight: Record<Level, number> = {
    EASY: 1,
    MEDIUM: 2,
    HARD: 3,
    EXPERT: 4,
    MIX: 2, // arbitraire
};

function weightToLevel(avg: number): Level {
    if (avg < 1.5) return "EASY";
    if (avg < 2.5) return "MEDIUM";
    if (avg < 3.5) return "HARD";
    return "EXPERT";
}

type CompetencyMeta = {
    id: string;
    slug: string;
    name: string;
    type: CompetencyType;
    level: Level;
    familyId: string;
    familySlug: string;
    familyName: string;
    subFamilyId: string | null;
    subFamilySlug: string | null;
};

/**
 * Construit le payload complet envoyé au LLM pour générer un quiz adaptatif
 * à partir des 5 derniers quizzes d'un utilisateur sur un job donné.
 */
export async function buildGenerateQuizInput(params: {
    userId: string;
    userJobId: string;
    generationParameters: GenerationParameters;
    selectedJobIds?: string[];
}): Promise<GenerateQuizInput> {
    const { userId, userJobId, generationParameters, selectedJobIds } = params;

    // 1) Récupérer le UserJob + user + job + sélection
    const userJob = await prisma.userJob.findUnique({
        where: {
            id: userJobId,
        },
        include: {
            user: true,
            job: {
                include: {
                    competenciesFamilies: true,
                    jobSubfamilyCompetencies: {
                        include: {
                            subFamily: {
                                include: {
                                    family: true,
                                },
                            },
                            competency: true,
                        },
                    },
                    competencies: {
                        include: {
                            families: true,
                            subFamilies: {
                                include: {
                                    family: true,
                                },
                            },
                        },
                    },
                },
            },
            jobFamily: true,
            selectedJobs: {
                include: {
                    job: true,
                },
            },
        },
    });

    if (!userJob || userJob.userId !== userId) {
        throw new Error("UserJob not found for given userId + userJobId");
    }

    const user = userJob.user;
    const activeSelectedJobIds =
        userJob.scope === "JOB"
            ? userJob.jobId
                ? [userJob.jobId]
                : []
            : selectedJobIds ?? userJob.selectedJobs.filter((sj) => sj.isSelected).map((sj) => sj.jobId);

    if (!activeSelectedJobIds.length) {
        throw new Error("No selected jobs available for quiz generation");
    }

    const jobs = await prisma.job.findMany({
        where: {
            id: { in: activeSelectedJobIds },
        },
        include: {
            competenciesFamilies: true,
            jobSubfamilyCompetencies: {
                include: {
                    subFamily: {
                        include: {
                            family: true,
                        },
                    },
                    competency: true,
                },
            },
            competencies: {
                include: {
                    families: true,
                    subFamilies: {
                        include: {
                            family: true,
                        },
                    },
                },
            },
        },
    });

    if (jobs.length !== activeSelectedJobIds.length) {
        throw new Error("Some selected jobs were not found for quiz generation");
    }

    if (userJob.scope === "JOB_FAMILY" && userJob.jobFamilyId) {
        const mismatch = jobs.find((job) => job.jobFamilyId !== userJob.jobFamilyId);
        if (mismatch) {
            throw new Error("Selected jobs do not belong to the user job family");
        }
    }

    const jobContext =
        jobs.length === 1
            ? {
                id: jobs[0].id,
                slug: jobs[0].slug,
                title: jobs[0].title,
                description: jobs[0].description ?? null,
            }
            : {
                id: userJob.jobFamily?.id ?? userJob.jobFamilyId ?? jobs[0].id,
                slug: userJob.jobFamily?.slug ?? "job-family",
                title: userJob.jobFamily?.name ?? "Famille de metiers",
                description: null,
            };

    // 2) Construire la meta des compétences pour ce job
    const competencyMetaById = new Map<string, CompetencyMeta>();
    const familyById = new Map<string, { id: string; slug: string; name: string }>();

    const registerFamily = (family: { id: string; slug: string; name: string }) => {
        if (!familyById.has(family.id)) {
            familyById.set(family.id, {
                id: family.id,
                slug: family.slug,
                name: family.name,
            });
        }
    };

    for (const job of jobs) {
        for (const family of job.competenciesFamilies) {
            registerFamily(family);
        }

        for (const jsc of job.jobSubfamilyCompetencies) {
            const comp = jsc.competency;
            const subFamily = jsc.subFamily;
            const family = subFamily.family;

            registerFamily(family);

            competencyMetaById.set(comp.id, {
                id: comp.id,
                slug: comp.slug,
                name: comp.name,
                type: comp.type,
                level: comp.level,
                familyId: family.id,
                familySlug: family.slug,
                familyName: family.name,
                subFamilyId: subFamily.id,
                subFamilySlug: subFamily.slug,
            });
        }

        for (const comp of job.competencies) {
            if (competencyMetaById.has(comp.id)) {
                continue;
            }

            const subFamily = comp.subFamilies[0] ?? null;
            const family = subFamily?.family ?? comp.families[0] ?? null;

            if (!family) {
                continue;
            }

            registerFamily(family);

            competencyMetaById.set(comp.id, {
                id: comp.id,
                slug: comp.slug,
                name: comp.name,
                type: comp.type,
                level: comp.level,
                familyId: family.id,
                familySlug: family.slug,
                familyName: family.name,
                subFamilyId: subFamily?.id ?? null,
                subFamilySlug: subFamily?.slug ?? null,
            });
        }
    }

    // 3) Charger les 5 derniers quizzes complétés pour ce UserJob
    const userQuizzes = await prisma.userQuiz.findMany({
        where: {
            userJobId: userJob.id,
            status: UserQuizStatus.COMPLETED,
        },
        orderBy: {
            completedAt: "desc",
        },
        take: 5,
        include: {
            quiz: {
                include: {
                    items: {
                        include: {
                            question: {
                                include: {
                                    responses: {orderBy: {index: 'asc'}},
                                },
                            },
                        },
                        orderBy: {index: 'asc'},
                    },
                },
            },
            answers: {
                include: {
                    options: true,
                },
            },
        },
    });

    // 4) Stats globales par compétence (UserJobCompetency)
    const userJobCompetencies = await prisma.userJobCompetency.findMany({
        where: {
            userJobId: userJob.id,
        },
    });

    const ujcByCompetencyId = new Map(
        userJobCompetencies.map((ujc) => [ujc.competencyId, ujc])
    );

    // 5) Kiviat Job + UserJob pour résumer par famille
    const jobKiviats = await prisma.jobKiviat.findMany({
        where: {
            jobId: { in: jobs.map((job) => job.id) },
            level: generationParameters.targetJobProgressionLevel,
        },
    });

    const userJobKiviats = await prisma.userJobKiviat.findMany({
        where: {
            userJobId: userJob.id,
        },
    });

    const jobKiviatByFamilyId = new Map<string, { sum: number; count: number }>();
    for (const jk of jobKiviats) {
        const entry = jobKiviatByFamilyId.get(jk.competenciesFamilyId) ?? { sum: 0, count: 0 };
        entry.sum += Number(jk.radarScore0to5);
        entry.count += 1;
        jobKiviatByFamilyId.set(jk.competenciesFamilyId, entry);
    }

    const userKiviatByFamilyId = new Map<string, number>();
    for (const ujk of userJobKiviats) {
        userKiviatByFamilyId.set(ujk.competenciesFamilyId, ujk.radarScore0to5);
    }

    // 6) Construction du bloc last5Quizzes + agrégats par compétence et par famille
    const last5Quizzes: LlmUserQuizHistory[] = [];
    const competencyAgg = new Map<
        string,
        {
            attempts: number;
            correct: number;
            wrong: number;
            totalTime: number;
            lastSeenAt: Date | null;
            histogram: {
                EASY: number;
                MEDIUM: number;
                HARD: number;
                EXPERT: number;
            };
        }
    >();

    const familyAgg = new Map<
        string,
        {
            questionsCount: number;
            correct: number;
            wrong: number;
            levelWeightSum: number;
            levelCount: number;
        }
    >();

    for (const uq of userQuizzes) {
        const answersByQuestionId = new Map(
            uq.answers.map((a) => [a.questionId, a])
        );

        const questions: LlmQuizQuestionHistory[] = [];

        for (const item of uq.quiz.items) {
            const q = item.question;
            const answer = answersByQuestionId.get(q.id) || null;
            const meta = competencyMetaById.get(q.competencyId);
            const timeLimitInSeconds = item.timeLimitOverrideS ?? q.defaultTimeLimitS ?? 30;

            // 6.1 Historique question pour LLM
            const questionHistory: LlmQuizQuestionHistory = {
                id: q.id,
                text: q.text,
                competencyId: q.competencyId,
                competencySlug: meta?.slug ?? null,
                competencyName: meta?.name ?? null,
                familySlug: meta?.familySlug ?? null,
                subFamilySlug: meta?.subFamilySlug ?? null,
                level: q.level,
                type: q.type,
                timeLimitInSeconds,
                index: item.index,
                responses: q.responses.map((r) => ({
                    id: r.id,
                    text: r.text,
                    isCorrect: r.isCorrect,
                    index: r.index,
                })),
                userAnswer: answer
                    ? {
                        isCorrect: answer.isCorrect,
                        timeToAnswer: answer.timeToAnswer,
                        chosenResponseIds: answer.options.map((o) => o.responseId),
                        freeTextAnswer: answer.freeTextAnswer,
                        score: answer.score,
                    }
                    : null,
            };

            questions.push(questionHistory);

            // 6.2 Agrégat par compétence
            const compId = q.competencyId;
            if (!competencyAgg.has(compId)) {
                competencyAgg.set(compId, {
                    attempts: 0,
                    correct: 0,
                    wrong: 0,
                    totalTime: 0,
                    lastSeenAt: null,
                    histogram: {
                        EASY: 0,
                        MEDIUM: 0,
                        HARD: 0,
                        EXPERT: 0,
                    },
                });
            }

            const compStats = competencyAgg.get(compId)!;
            compStats.attempts += 1;

            if (answer) {
                if (answer.isCorrect) compStats.correct += 1;
                else compStats.wrong += 1;
                compStats.totalTime += answer.timeToAnswer;
            } else {
                // pas de réponse → on peut considérer comme wrong ou neutre
                compStats.wrong += 1;
            }

            const seenAt = uq.completedAt ?? uq.updatedAt ?? uq.assignedAt;
            if (!compStats.lastSeenAt || seenAt > compStats.lastSeenAt) {
                compStats.lastSeenAt = seenAt;
            }

            if (q.level === "EASY" || q.level === "MEDIUM" || q.level === "HARD" || q.level === "EXPERT") {
                compStats.histogram[q.level] += 1;
            }

            // 6.3 Agrégat par famille
            if (meta) {
                if (!familyAgg.has(meta.familyId)) {
                    familyAgg.set(meta.familyId, {
                        questionsCount: 0,
                        correct: 0,
                        wrong: 0,
                        levelWeightSum: 0,
                        levelCount: 0,
                    });
                }

                const famStats = familyAgg.get(meta.familyId)!;
                famStats.questionsCount += 1;

                if (answer && answer.isCorrect) famStats.correct += 1;
                else famStats.wrong += 1;

                famStats.levelWeightSum += levelToWeight[q.level];
                famStats.levelCount += 1;
            }
        }

        const uqHistory: LlmUserQuizHistory = {
            userQuizId: uq.id,
            quizId: uq.quizId,
            type: uq.type,
            assignedAt: uq.assignedAt.toISOString(),
            startedAt: uq.startedAt ? uq.startedAt.toISOString() : null,
            completedAt: uq.completedAt ? uq.completedAt.toISOString() : null,
            totalScore: uq.totalScore,
            maxScore: uq.maxScore,
            percentage: uq.percentage,
            quizLevel: uq.quiz.level,
            quizTitle: uq.quiz.title ?? null,
            quizDescription: uq.quiz.description ?? null,
            questions,
        };

        last5Quizzes.push(uqHistory);
    }

    // 7) Construire competencySummaries
    const competencySummaries: CompetencyPerformanceSummary[] = [];

    for (const [compId, agg] of competencyAgg.entries()) {
        const meta = competencyMetaById.get(compId);
        if (!meta) {
            // Compétence qui n'est pas mappée pour ce job → on peut l'ignorer
            continue;
        }

        const ujc = ujcByCompetencyId.get(compId);

        const attempts = agg.attempts || 1;
        const successRate = agg.correct / attempts;
        const avgTime = agg.totalTime / attempts;

        competencySummaries.push({
            competencyId: meta.id,
            competencySlug: meta.slug,
            competencyName: meta.name,
            type: meta.type,
            familyId: meta.familyId,
            familySlug: meta.familySlug,
            familyName: meta.familyName,
            subFamilyId: meta.subFamilyId,
            subFamilySlug: meta.subFamilySlug,
            attemptsLast5Quizzes: agg.attempts,
            correctCount: agg.correct,
            wrongCount: agg.wrong,
            successRate,
            avgTimeToAnswer: avgTime,
            lastSeenAt: agg.lastSeenAt ? agg.lastSeenAt.toISOString() : null,
            difficultyHistogram: agg.histogram,
            globalStats: ujc
                ? {
                    percentage: ujc.percentage,
                    attemptsCount: ujc.attemptsCount,
                    bestScore: ujc.bestScore,
                    level: ujc.level,
                }
                : undefined,
        });
    }

    // 8) Construire familySummaries
    const familySummaries: FamilyPerformanceSummary[] = [];

    for (const [familyId, agg] of familyAgg.entries()) {
        const jobFamily = familyById.get(familyId);
        if (!jobFamily) continue;

        const questionsCount = agg.questionsCount || 1;
        const successRate = agg.correct / questionsCount;
        const avgWeight = agg.levelCount
            ? agg.levelWeightSum / agg.levelCount
            : 2; // MEDIUM par défaut

        const avgLevel = weightToLevel(avgWeight);

        familySummaries.push({
            familyId,
            familySlug: jobFamily.slug,
            familyName: jobFamily.name,
            userKiviatValue: userKiviatByFamilyId.get(familyId) ?? null,
            targetKiviatValue: jobKiviatByFamilyId.get(familyId)
                ? jobKiviatByFamilyId.get(familyId)!.sum / jobKiviatByFamilyId.get(familyId)!.count
                : null,
            questionsCountLast5Quizzes: agg.questionsCount,
            successRateLast5Quizzes: successRate,
            avgQuestionLevel: avgLevel,
        });
    }

    // 9) Contexte job (families + competencies)
    const families = Array.from(familyById.values()).map((f) => ({
        id: f.id,
        slug: f.slug,
        name: f.name,
    }));

    const competencies: LlmJobCompetency[] = [];
    for (const meta of competencyMetaById.values()) {
        competencies.push({
            id: meta.id,
            slug: meta.slug,
            name: meta.name,
            type: meta.type,
            level: meta.level,
            familySlug: meta.familySlug,
            subFamilySlug: meta.subFamilySlug,
        });
    }

    // 10) Contexte user simple
    const leagueTier = userJob.leagueTier;
    const leaguePoints = userJob.leaguePoints;
    const winningStreak = userJob.winningStreak;

    const result: GenerateQuizInput = {
        user: {
            id: user.id,
            leagueTier,
            leaguePoints,
            winningStreak,
        },
        job: {
            ...jobContext,
            families,
            competencies,
        },
        last5Quizzes,
        competencySummaries,
        familySummaries,
        generationParameters,
    };

    return result;
}
