import {prisma} from "../config/db";
import {CompetencyType, Level, UserQuizStatus} from "@prisma/client";
import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
});

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
}

const MAX_CONTEXT_QUESTION_LENGTH = 160;
const MAX_CONTEXT_ANSWERS_LENGTH = 160;

function truncateText(value: string | null | undefined, maxLength: number): string {
    const text = (value ?? '').trim();
    if (!text || text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, maxLength - 1)}…`;
}

const getArticlePromptUserSide = (quizContext: QuizContext) => {
    const systemPrompt = `
Tu es un expert pédagogique.
Tu écris des articles d'apprentissage clairs et progressifs pour aider un utilisateur à progresser sur un métier.
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
        `- [${q.competencyName}] ${truncateText(q.questionText, MAX_CONTEXT_QUESTION_LENGTH)} (réponse: ${truncateText((q.userAnswer ?? []).join(", ") || q.freeTextAnswer, MAX_CONTEXT_ANSWERS_LENGTH)})`
    ).join("\n")}

Questions bien réussies (max 2):
${quizContext.strongPoints.slice(0, 2).map(q =>
        `- [${q.competencyName}] ${truncateText(q.questionText, MAX_CONTEXT_QUESTION_LENGTH)}`
    ).join("\n")}

Contraintes pour l'article :
- Format : Markdown uniquement.
- 1 seul H1 (<= 45 caractères).
- 2 intertitres max (H2/H3).
- 3 à 4 paragraphes.
- 220 à 320 mots.
- Ton clair, concret, motivant.
- Ne mentionne pas le quiz ni la base de données.
`;

    return {systemPrompt, userPrompt};
}

const getLastQuizForUserJob = async (userJobId: string) => {
    const lastUserQuiz = await prisma.userQuiz.findFirst({
        where: {userJobId, status: UserQuizStatus.COMPLETED},
        orderBy: {completedAt: "desc"},
        include: {
            quiz: {include: {job: true}},
            answers: {
                include: {
                    question: {include: {competency: true}},
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

export const generateMarkdownArticleForLastQuiz = async (userJobId: string, userId: string): Promise<any> => {
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
            userAnswerSummary: [
                a.options.map(o => o.response.text).join(", "),
                a.freeTextAnswer,
            ].filter(Boolean).join(" | "),
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

    const {systemPrompt, userPrompt} = getArticlePromptUserSide(quizContext);

    const article = await callOpenAIForArticle(systemPrompt, userPrompt);
    if (!article) {
        return null;
    }

    await saveLearningResourceFromArticle(
        userJobId,
        userId,
        article,
        quizContext,
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

async function callOpenAIForArticle(systemPrompt: string, userPrompt: string): Promise<GeneratedArticle | null> {
    const baseInstructions = `
Consignes de sortie :
- Génère un titre (45 caractères max) et une description courte (1-2 phrases) cohérents avec l'article.
- Réponds UNIQUEMENT avec un objet JSON valide de la forme {"title": "...", "description": "...", "markdown": "..."}.
- Ne renvoie rien d'autre que cet objet JSON. Le champ "markdown" doit contenir l'article complet.`;

    const finalUserPrompt = `${userPrompt}
${baseInstructions}`;

    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            {role: "system", content: systemPrompt},
            {role: "user", content: finalUserPrompt},
        ],
        temperature: 0.2,
        response_format: {type: "json_object"},
        max_completion_tokens: 900,
    });

    const raw = completion.choices[0]?.message?.content ?? "";
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

    return resource;
}

// generateMarkdownArticleForLastQuiz("623cfcd5-4a24-4cdf-b16f-52c8a46be6d6", "0783aad4-54b1-4dd6-945a-197033995605").then(article => {
//     console.log(article);
// });
