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

const getArticlePromptUserSide = (quizContext: QuizContext) => {
    const systemPrompt = `
Tu es un expert pédagogique.
Tu écris des articles d'apprentissage clairs et progressifs pour aider un utilisateur à progresser sur un métier.
Tu dois produire un article COMPLET en Markdown, sans intro de type "En tant que modèle de langage", etc.
`;
    const userPrompt = `
Génère un article pédagogique complet en **Markdown** pour aider l'utilisateur à progresser sur le métier : "${quizContext?.globalSummary?.jobTitle}".

Contexte du quiz:
- Titre du quiz : ${quizContext.globalSummary.quizTitle}
- Score : ${quizContext.globalSummary.totalScore} / ${quizContext.globalSummary.maxScore} (${quizContext.globalSummary.percentage}%)

Compétences évaluées (triées des plus faibles aux plus fortes):
${quizContext.competencies.map(c =>
        `- ${c.competencyName} (${c.type}, niveau ${c.level}) : ${c.quizPercentage}%`
    ).join("\n")}

Questions où l'utilisateur a eu des difficultés:
${quizContext.weakPoints.map(q =>
        `- [${q.competencyName}] ${q.questionText} (réponse de l'utilisateur: ${q.userAnswer?.join(", ")}${q.freeTextAnswer ? ` ; réponse libre: ${q.freeTextAnswer}` : ""})`
    ).join("\n")}

Questions bien réussies:
${quizContext.strongPoints.map(q =>
        `- [${q.competencyName}] ${q.questionText}`
    ).join("\n")}

Contraintes pour l'article :
- Format : **Markdown uniquement** (titres, listes, tableaux, code blocks si utile).
- Structure :
== OBJECTIF DE L'ARTICLE ==
Écrire un article pédagogique et vivant qui :
- explique concrètement le métier de {{jobTitle}},
- s’appuie sur les résultats récents de l’utilisateur pour illustrer où il est à l’aise et où il doit progresser,
- lui donne des pistes d’action concrètes, sans tomber dans un ton scolaire.

2) DES EXIGENCES DE STYLE (inspiré de The Hustle) :
- Ton conversationnel, direct, légèrement taquin mais respectueux.
- Phrases courtes, rythme dynamique.
- Utilise des exemples concrets tirés du quotidien d’un {{jobTitle}}.
- Utilise des analogies ou métaphores simples pour expliquer les notions abstraites.
- Évite le jargon non expliqué.

3) DES CONTRAINTES FORMELLES STRICTES :
- Titre principal :
  - exactement 1 seul titre H1 (avec "# " au début de la ligne),
  - maximum 45 caractères (ne dépasse jamais cette longueur).
- Corps du texte :
  - exactement 5 paragraphes.
  - Un paragraphe = un bloc de texte continu séparé des autres par une ligne vide.
  - Aucun bullet point, aucune liste, aucun tableau dans le corps de l’article.
  - exactement 3 intertitres au total (en H2 ou H3, par exemple "## ..." ou "### ...").
  - Les intertitres ne comptent pas comme paragraphes.
  - Organisation recommandée (sans l’annoncer explicitement) :
    - Paragraphe 1 : introduction accrocheuse qui plante le décor du métier et évoque l’évaluation récente.
    - Paragraphe 2 (sous un intertitre) : ce que fait un {{jobTitle}} au quotidien, avec des exemples concrets.
    - Paragraphe 3 (sous un intertitre) : ce que révèlent les résultats de l’évaluation, surtout sur les compétences les plus faibles.
    - Paragraphe 4 (sous un intertitre) : conseils pratiques et situations types pour progresser sur ces compétences.
    - Paragraphe 5 : conclusion motivante avec un mini plan d’action décrit sous forme de texte (pas de liste).
    - Durée de lecture visée : environ 3 minutes.
    - Vise environ 500 à 700 mots sans mentionner ce chiffre dans l’article.- Ton : pédagogique, bienveillant, concret.
- Ne fais aucune référence au système de quiz interne ni à la base de données. Parle simplement d'"évaluation" ou de "test".
- N'ajoute pas de texte en dehors du Markdown.
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

    const attempt = async (strict: boolean, temperature: number): Promise<GeneratedArticle | null> => {
        const finalUserPrompt = `${userPrompt}
${baseInstructions}
${strict ? '- Si tu ne peux pas répondre en JSON strict, renvoie un JSON vide {}.' : ''}`;

        const completion = await openai.chat.completions.create({
            model: "gpt-5.1",
            messages: [
                {role: "system", content: systemPrompt},
                {role: "user", content: finalUserPrompt},
            ],
            temperature,
            response_format: {type: "json_object"},
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
    };

    const firstAttempt = await attempt(false, 0.4);
    if (firstAttempt) {
        return firstAttempt;
    }

    return await attempt(true, 0.0);
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
