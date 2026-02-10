import {prisma} from "../config/db";
import {CompetencyType, Level, UserQuizStatus} from "@prisma/client";
import OpenAI from "openai";
import {GoogleGenAI} from "@google/genai";
import {realtimeBus} from "../realtime/realtimeBus";

const getOpenAIClient = () => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error("OPENAI_API_KEY is required for article generation");
    }
    return new OpenAI({apiKey});
};

const getGeminiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY (or GOOGLE_API_KEY) is required for article generation");
    }
    return new GoogleGenAI({apiKey});
};

type AiProvider = "openai" | "gemini";

const getAiProvider = (): AiProvider => {
    const rawProvider = (process.env.AI_PROVIDER ?? "openai").trim().toLowerCase();
    if (rawProvider === "openai" || rawProvider === "gemini") {
        return rawProvider;
    }
    throw new Error(`AI_PROVIDER must be "openai" or "gemini" (got "${rawProvider}")`);
};

export interface QuizContext {
    jobTitle: string;
    globalSummary: GlobalQuizSummary;
    competencies: CompetencySummary[];
    weakPoints: QuestionSummary[];
    strongPoints: QuestionSummary[];
}

export interface GlobalQuizSummary {
    quizTitle: string;
    jobTitle: string;
    totalScore: number;
    maxScore: number;
    percentage: number;
    completedAt: Date;
}

export interface CompetencySummary {
    competencyName: string;
    type: CompetencyType;
    level: Level;
    quizPercentage: number | null;
}

interface QuestionSummary {
    competencyName: string;
    questionText: string;
    userAnswer?: string[];
    freeTextAnswer?: string;
    correctAnswer?: string[];
}

const MAX_CONTEXT_QUESTION_LENGTH = 160;
const MAX_CONTEXT_ANSWERS_LENGTH = 160;

function normalizeLangCode(value?: string | null): string | null {
    const trimmed = (value ?? '').trim();
    if (!trimmed) {
        return null;
    }
    return trimmed.toLowerCase();
}

function getBaseLang(value?: string | null): string | null {
    const normalized = normalizeLangCode(value);
    if (!normalized) {
        return null;
    }
    return normalized.split('-')[0];
}

async function resolveArticleLanguage(userId: string, requestLang?: string | null): Promise<string> {
    const normalizedRequest = normalizeLangCode(requestLang);
    if (normalizedRequest) {
        return normalizedRequest;
    }

    const user = await prisma.user.findUnique({
        where: {id: userId},
        select: {preferredLangCode: true},
    });
    const normalizedUser = normalizeLangCode(user?.preferredLangCode);
    return normalizedUser || 'fr';
}

function truncateText(value: string | null | undefined, maxLength: number): string {
    const text = (value ?? '').trim();
    if (!text || text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, maxLength - 1)}…`;
}

function formatAnswerList(values?: string[], fallback = 'non renseignée') {
    const text = (values ?? []).map(v => v.trim()).filter(Boolean).join(", ");
    return text || fallback;
}

const getArticlePromptUserSide = (quizContext: QuizContext, lang: string) => {
    const resolvedLang = normalizeLangCode(lang) || 'fr';
    const baseLang = getBaseLang(resolvedLang) || 'fr';

    const frenchPrompt = () => {
        const systemPrompt = `
Tu es un expert pédagogique.
Tu écris des articles d'apprentissage clairs, précis et progressifs pour aider un utilisateur à progresser sur un métier.
Tu t'appuies sur le contexte fourni pour expliquer les points faibles avec des exemples concrets.
Tu dois produire un article COMPLET en Markdown, sans intro de type "En tant que modèle de langage", etc.
`;
        const userPrompt = `
Génère un article pédagogique court en **Markdown** pour aider l'utilisateur à progresser sur le métier : "${quizContext?.globalSummary?.jobTitle}".

Contexte du quiz:
- Titre du quiz : ${quizContext.globalSummary.quizTitle}
- Score : ${quizContext.globalSummary.totalScore} / ${quizContext.globalSummary.maxScore} (${quizContext.globalSummary.percentage}%)

Compétences faibles (top 3):
${quizContext.competencies.slice(0, 3).map(c =>
        `- ${c.competencyName} (${c.type}, niveau ${c.level}) : ${c.quizPercentage}%`
    ).join("\n")}

Questions difficiles (max 3):
${quizContext.weakPoints.slice(0, 3).map(q =>
        `- [${q.competencyName}] ${truncateText(q.questionText, MAX_CONTEXT_QUESTION_LENGTH)} (réponse: ${truncateText(q.freeTextAnswer || formatAnswerList(q.userAnswer), MAX_CONTEXT_ANSWERS_LENGTH)}${(q.correctAnswer ?? []).length > 0 ? ` | attendu: ${truncateText(formatAnswerList(q.correctAnswer), MAX_CONTEXT_ANSWERS_LENGTH)}` : ""})`
    ).join("\n")}

Questions bien réussies (max 2):
${quizContext.strongPoints.slice(0, 2).map(q =>
        `- [${q.competencyName}] ${truncateText(q.questionText, MAX_CONTEXT_QUESTION_LENGTH)}`
    ).join("\n")}

Contraintes pour l'article :
- Format : Markdown uniquement.
- Ton clair, concret, motivant.
- Analyse 2 erreurs probables à partir des questions difficiles (sans parler de quiz).
- Explique la bonne logique ou méthode attendue pour chaque erreur.
- Propose un mini-plan d'entraînement en 3 actions très concrètes.
- Évite les généralités vagues, privilégie des conseils actionnables.
- Ne mentionne pas le quiz ni la base de données.
`;

        return {systemPrompt, userPrompt};
    };

    const englishPrompt = (targetLang?: string) => {
        const languageLine = targetLang && getBaseLang(targetLang) !== 'en'
            ? `\nWrite the full article in the following language: ${targetLang}.`
            : '';
        const systemPrompt = `
You are an expert educator.
You write clear, precise, progressive learning articles to help a user improve at a job.
You use the provided context to explain weak points with concrete examples.
You must produce a COMPLETE Markdown article, without intros like "As a language model", etc.${languageLine}
`;
        const userPrompt = `
Generate a short pedagogical article in **Markdown** to help the user improve at the job: "${quizContext?.globalSummary?.jobTitle}".

Quiz context:
- Quiz title: ${quizContext.globalSummary.quizTitle}
- Score: ${quizContext.globalSummary.totalScore} / ${quizContext.globalSummary.maxScore} (${quizContext.globalSummary.percentage}%)

Weak competencies (top 3):
${quizContext.competencies.slice(0, 3).map(c =>
            `- ${c.competencyName} (${c.type}, level ${c.level}): ${c.quizPercentage}%`
        ).join("\n")}

Difficult questions (max 3):
${quizContext.weakPoints.slice(0, 3).map(q =>
            `- [${q.competencyName}] ${truncateText(q.questionText, MAX_CONTEXT_QUESTION_LENGTH)} (answer: ${truncateText(q.freeTextAnswer || formatAnswerList(q.userAnswer, 'not provided'), MAX_CONTEXT_ANSWERS_LENGTH)}${(q.correctAnswer ?? []).length > 0 ? ` | expected: ${truncateText(formatAnswerList(q.correctAnswer, 'not provided'), MAX_CONTEXT_ANSWERS_LENGTH)}` : ""})`
        ).join("\n")}

Well-answered questions (max 2):
${quizContext.strongPoints.slice(0, 2).map(q =>
            `- [${q.competencyName}] ${truncateText(q.questionText, MAX_CONTEXT_QUESTION_LENGTH)}`
        ).join("\n")}

Article constraints:
- Format: Markdown only.
- Tone: clear, concrete, encouraging.${targetLang && getBaseLang(targetLang) !== 'en' ? `\n- Write the article in the following language: ${targetLang}.` : ''}
- Analyze 2 likely errors based on the difficult questions (do not mention a quiz).
- Explain the correct logic or expected method for each error.
- Propose a mini training plan in 3 very concrete actions.
- Avoid vague generalities, prioritize actionable advice.
- Do not mention the quiz nor the database.
`;

        return {systemPrompt, userPrompt};
    };

    if (baseLang === 'fr') {
        return frenchPrompt();
    }
    if (baseLang === 'en') {
        return englishPrompt();
    }
    return englishPrompt(resolvedLang);
}

const getLastQuizForUserJob = async (userJobId: string) => {
    const lastUserQuiz = await prisma.userQuiz.findFirst({
        where: {userJobId, status: UserQuizStatus.COMPLETED},
        orderBy: {completedAt: "desc"},
        include: {
            quiz: {include: {job: true}},
            answers: {
                include: {
                    question: {include: {competency: true, responses: true}},
                    options: {include: {response: true}},
                },
            },
            competencyHistories: {
                include: {
                    userJobCompetency: {include: {competency: true}},
                },
            },
        },
    });

    return lastUserQuiz;
};

export const generateMarkdownArticleForLastQuiz = async (userJobId: string, userId: string, lang?: string): Promise<any> => {
    const lastUserQuiz = await getLastQuizForUserJob(userJobId);

    if (!lastUserQuiz) {
        return "Aucun quiz complété trouvé pour ce poste.";
    }

    const userJob = await prisma.userJob.findUnique({
        where: {id: userJobId},
        select: {jobFamily: true},
    });

    const globalSummary: GlobalQuizSummary = {
        quizTitle: lastUserQuiz.quiz.title ?? "Évaluation",
        jobTitle: lastUserQuiz.quiz.job?.title ?? userJob?.jobFamily?.name ?? "Famille de métiers",
        totalScore: lastUserQuiz.totalScore,
        maxScore: lastUserQuiz.maxScore,
        percentage: lastUserQuiz.percentage,
        completedAt: lastUserQuiz.completedAt,
    } as GlobalQuizSummary;

    const competenciesSummary: CompetencySummary[] = lastUserQuiz.competencyHistories
        .map(h => ({
            competencyName: h.userJobCompetency.competency.name,
            type: h.userJobCompetency.competency.type,
            level: h.userJobCompetency.competency.level,
            quizPercentage: h.percentage,
        }))
        .sort((a, b) => (a.quizPercentage ?? 0) - (b.quizPercentage ?? 0));

    const weakQuestions: QuestionSummary[] = lastUserQuiz.answers
        .filter(a => !a.isCorrect)
        // .slice(0, 5)
        .map(a => ({
            competencyName: a.question.competency.name,
            questionText: a.question.text,
            userAnswer: a.options.map(o => o.response.text).filter(Boolean),
            freeTextAnswer: a.freeTextAnswer ?? undefined,
            correctAnswer: a.question.responses
                .filter(r => r.isCorrect)
                .map(r => r.text)
                .filter(Boolean),
        }));

    const strongQuestions: QuestionSummary[] = lastUserQuiz.answers
        .filter(a => a.isCorrect)
        // .slice(0, 5)
        .map(a => ({
            competencyName: a.question.competency.name,
            questionText: a.question.text,
        }));


    const quizContext: QuizContext = {
        jobTitle: globalSummary.jobTitle,
        globalSummary: globalSummary,
        competencies: competenciesSummary,
        weakPoints: weakQuestions,
        strongPoints: strongQuestions,
    };

    const resolvedLang = await resolveArticleLanguage(userId, lang);
    const {systemPrompt, userPrompt} = getArticlePromptUserSide(quizContext, resolvedLang);

    const article = await callAIForArticle(systemPrompt, userPrompt);
    if (!article) {
        return null;
    }

    await saveLearningResourceFromArticle(
        userJobId,
        userId,
        article,
        quizContext,
        resolvedLang,
    );


    return await prisma.learningResource.findFirst({
        where: {
            userJobId,
            type: "ARTICLE",
            source: "AI_GENERATED",
        },
        orderBy: {
            createdAt: "desc",
        },
        include: {
            createdBy: true,
        }
    });
}

type GeneratedArticle = { title: string; description: string; markdown: string };

async function callAIForArticle(systemPrompt: string, userPrompt: string): Promise<GeneratedArticle | null> {
    const provider = getAiProvider();
    if (provider === "gemini") {
        return callGeminiForArticle(systemPrompt, userPrompt);
    }
    return callOpenAIForArticle(systemPrompt, userPrompt);
}

async function callOpenAIForArticle(systemPrompt: string, userPrompt: string): Promise<GeneratedArticle | null> {
    const baseInstructions = `
Consignes de sortie :
- Génère un titre (45 caractères max) et une description courte (1-2 phrases) cohérents avec l'article.
- Réponds UNIQUEMENT avec un objet JSON valide de la forme {"title": "...", "description": "...", "markdown": "..."}.
- Ne renvoie rien d'autre que cet objet JSON. Le champ "markdown" doit contenir l'article complet.`;

    const finalUserPrompt = `${userPrompt}
${baseInstructions}`;

    const openai = getOpenAIClient();
    const response = await openai.responses.create({
        model: process.env.OPENAI_MODEL ?? "gpt-5.2",
        input: [
            {role: "system", content: systemPrompt},
            {role: "user", content: finalUserPrompt},
        ],
        temperature: 0.4,
        text: {format: {type: "json_object"}},
        // max_output_tokens: 1000,
    });

    const raw = response.output_text?.trim() ?? "";
    if (!raw) {
        return null;
    }

    const cleaned = raw.trim()
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/, "")
        .trim();

    let parsed: Partial<GeneratedArticle> | null = null;
    try {
        parsed = JSON.parse(cleaned) as Partial<GeneratedArticle>;
    } catch (err) {
        return null;
    }
    if (!parsed.markdown || !parsed.title || !parsed.description) {
        return null;
    }

    return {
        title: parsed.title,
        description: parsed.description,
        markdown: parsed.markdown,
    };
}

async function callGeminiForArticle(systemPrompt: string, userPrompt: string): Promise<GeneratedArticle | null> {
    const baseInstructions = `
Consignes de sortie :
- Génère un titre (45 caractères max) et une description courte (1-2 phrases) cohérents avec l'article.
- Réponds UNIQUEMENT avec un objet JSON valide de la forme {"title": "...", "description": "...", "markdown": "..."}.
- Ne renvoie rien d'autre que cet objet JSON. Le champ "markdown" doit contenir l'article complet.`;

    const finalUserPrompt = `${userPrompt}
${baseInstructions}`;

    const gemini = getGeminiClient();
    const response = await gemini.models.generateContent({
        model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
        contents: [{role: "user", parts: [{text: finalUserPrompt}]}],
        config: {
            systemInstruction: systemPrompt,
            temperature: 0.4,
            responseMimeType: "application/json",
            // maxOutputTokens: 1000,
        },
    });

    const raw = response.text?.trim() ?? "";
    if (!raw) {
        return null;
    }

    const cleaned = raw.trim()
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/, "")
        .trim();

    let parsed: Partial<GeneratedArticle> | null = null;
    try {
        parsed = JSON.parse(cleaned) as Partial<GeneratedArticle>;
    } catch (err) {
        return null;
    }
    if (!parsed.markdown || !parsed.title || !parsed.description) {
        return null;
    }

    return {
        title: parsed.title,
        description: parsed.description,
        markdown: parsed.markdown,
    };
}

async function saveLearningResourceFromArticle(
    userJobId: string,
    userId: string,
    article: GeneratedArticle,
    quizContext: any,
    lang: string,
) {
    // Titre simple basé sur le job + date ou score
    const fallbackTitle = `Plan d'apprentissage personnalisé - ${quizContext.globalSummary.jobTitle}`;
    const fallbackDescription = `Article généré à partir de la dernière évaluation (${quizContext.globalSummary.percentage}% de réussite).`;
    const title = article.title || fallbackTitle;
    const description = article.description || fallbackDescription;

    // On récupère le UserJob pour avoir le jobId
    const userJob = await prisma.userJob.findUnique({
        where: {id: userJobId},
        select: {jobId: true, jobFamilyId: true},
    });

    if (!userJob) {
        throw new Error("UserJob introuvable lors de la sauvegarde de la ressource.");
    }

    const resource = await prisma.learningResource.create({
        data: {
            scope: "USER_JOB",
            type: "ARTICLE",
            source: "AI_GENERATED",
            title,
            description,
            content: article.markdown,
            languageCode: lang,
            // userJobId,
            // jobId: userJob.jobId,
            userJob: {
                connect: {id: userJobId},
            },
            ...(userJob.jobId
                ? {job: {connect: {id: userJob.jobId}}}
                : userJob.jobFamilyId
                    ? {jobFamily: {connect: {id: userJob.jobFamilyId}}}
                    : {}),
            createdBy: {
                connect: {id: userId}
            }
        },
    });

    realtimeBus.publishToUser(userId, 'content.available', {
        resourceId: resource.id,
        userJobId,
        scope: resource.scope,
        type: resource.type,
        title: resource.title,
        description: resource.description,
        auto_display: true,
    });

    return resource;
}

// generateMarkdownArticleForLastQuiz("623cfcd5-4a24-4cdf-b16f-52c8a46be6d6", "0783aad4-54b1-4dd6-945a-197033995605").then(article => {
//     console.log(article);
// });
