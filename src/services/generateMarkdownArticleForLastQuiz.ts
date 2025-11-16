import {prisma} from "../config/db";
import {UserQuizStatus} from "@prisma/client";
import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
});


const getArticlePromptUserSide = (quizContext: any) => {
//     const systemPrompt = `
// Tu es un expert pédagogique.
// Tu écris des articles d'apprentissage clairs et progressifs pour aider un utilisateur à progresser sur un métier.
// Tu dois produire un article COMPLET en Markdown, sans intro de type "En tant que modèle de langage", etc.
// `;
//     const userPrompt = `
// Génère un article pédagogique complet en **Markdown** pour aider l'utilisateur à progresser sur le métier : "${quizContext?.globalSummary?.jobTitle}".
//
// Contexte du quiz:
// - Titre du quiz : ${quizContext.globalSummary.quizTitle}
// - Score : ${quizContext.globalSummary.totalScore} / ${quizContext.globalSummary.maxScore} (${quizContext.globalSummary.percentage}%)
//
// Compétences évaluées (triées des plus faibles aux plus fortes):
// ${quizContext.competenciesSummary.map(c =>
//         `- ${c.competencyName} (${c.type}, niveau ${c.level}) : ${c.quizPercentage}%`
//     ).join("\n")}
//
// Questions où l'utilisateur a eu des difficultés:
// ${quizContext.weakQuestions.map(q =>
//         `- [${q.competencyName}] ${q.questionText} (réponse de l'utilisateur: ${q.userAnswer.join(", ")}${q.freeTextAnswer ? ` ; réponse libre: ${q.freeTextAnswer}` : ""})`
//     ).join("\n")}
//
// Questions bien réussies:
// ${quizContext.strongQuestions.map(q =>
//         `- [${q.competencyName}] ${q.questionText}`
//     ).join("\n")}
//
// Contraintes pour l'article :
// - Format : **Markdown uniquement** (titres, listes, tableaux, code blocks si utile).
// - Structure :
//   1. Un titre H1 accrocheur.
//   2. Une introduction courte qui explique les objectifs de l'article.
//   3. Une section par compétence clé à travailler (en commençant par les plus faibles) :
//      - explication simple des concepts,
//      - exemples concrets,
//      - erreurs fréquentes (en lien avec le quiz),
//      - mini-exercices ou questions à se poser.
//   4. Une courte section de valorisation des points forts de l'utilisateur (ce qu'il maîtrise déjà).
//   5. Un plan d'action concret pour les 7 prochains jours (bullet points).
// - Ton : pédagogique, bienveillant, concret.
// - Ne fais aucune référence au système de quiz interne ni à la base de données. Parle simplement d'"évaluation" ou de "test".
// - N'ajoute pas de texte en dehors du Markdown.
// `;

    return {systemPrompt: "", userPrompt: ""};
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

const generateMarkdownArticleForLastQuiz = async (userJobId: string, userId: string): Promise<string> => {
    const lastUserQuiz = await getLastQuizForUserJob(userJobId);

    if (!lastUserQuiz) {
        return "Aucun quiz complété trouvé pour ce poste.";
    }

    const globalSummary = {
        quizTitle: lastUserQuiz.quiz.title ?? "Évaluation",
        jobTitle: lastUserQuiz.quiz.job.title,
        totalScore: lastUserQuiz.totalScore,
        maxScore: lastUserQuiz.maxScore,
        percentage: lastUserQuiz.percentage,
        completedAt: lastUserQuiz.completedAt,
    };

    const competenciesSummary = lastUserQuiz.competencyHistories
        .map(h => ({
            competencyName: h.userJobCompetency.competency.name,
            type: h.userJobCompetency.competency.type,
            level: h.userJobCompetency.competency.level,
            quizPercentage: h.percentage,
        }))
        .sort((a, b) => (a.quizPercentage ?? 0) - (b.quizPercentage ?? 0));

    const weakQuestions = lastUserQuiz.answers
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

    const strongQuestions = lastUserQuiz.answers
        .filter(a => a.isCorrect)
        // .slice(0, 5)
        .map(a => ({
            competencyName: a.question.competency.name,
            questionText: a.question.text,
        }));


    const quizContext = {
        jobTitle: globalSummary.jobTitle,
        quizGlobal: globalSummary,
        competencies: competenciesSummary,
        weakPoints: weakQuestions,
        strongPoints: strongQuestions,
    };

    // const {systemPrompt, userPrompt} = getArticlePromptUserSide(quizContext);

    // const markdownArticle = await callOpenAIForArticle(systemPrompt, userPrompt);

    // await saveLearningResourceFromArticle(
    //     userJobId,
    //     userId,
    //     "markdownArticle",
    //     quizContext,
    // );


    return quizContext.toString();
}


generateMarkdownArticleForLastQuiz("623cfcd5-4a24-4cdf-b16f-52c8a46be6d6", "1").then(article => {
    console.log(article);
});

async function callOpenAIForArticle(systemPrompt: string, userPrompt: string): Promise<string> {
    const stream = await openai.chat.completions.create({
        stream: true,
        model: "gpt-4", // ou autre modèle adapté
        messages: [
            {role: "system", content: systemPrompt},
            {role: "user", content: userPrompt},
        ],
        temperature: 0.7,
    });

    let buffer = "";
    for await (const chunk of stream) {
        process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
        const delta = chunk.choices?.[0]?.delta?.content ?? "";
        if (delta) buffer += delta;
    }

    // Some models wrap JSON in code fences; strip defensively
    // const jsonText = buffer.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();


    // const markdown = response.choices[0]?.message?.content ?? "";
    const markdown = buffer;
    if (!markdown) {
        throw new Error("L'IA n'a pas renvoyé de contenu.");
    }
    return markdown;
}

async function saveLearningResourceFromArticle(
    userJobId: string,
    userId: string,
    markdown: string,
    quizContext: any,
) {
    // Titre simple basé sur le job + date ou score
    const title = `Plan d'apprentissage personnalisé - ${quizContext.globalSummary.jobTitle}`;
    const description = `Article généré à partir de la dernière évaluation (${quizContext.globalSummary.percentage}% de réussite).`;

    // On récupère le UserJob pour avoir le jobId
    const userJob = await prisma.userJob.findUnique({
        where: {id: userJobId},
        select: {jobId: true},
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
            content: markdown,
            userJobId,
            jobId: userJob.jobId,
            createdById: userId,
        },
    });

    return resource;
}
