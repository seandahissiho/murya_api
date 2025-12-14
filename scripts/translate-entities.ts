import {Command} from "commander";
import dotenv from "dotenv";
import {OpenAI} from "openai";
import {prisma} from "../src/config/db";
import {upsertTranslationRow} from "../src/i18n/upsert";

dotenv.config();

const program = new Command();

program
    .option("-l, --langs <langs>", "Lang codes cibles séparés par des virgules (ex: fr,en)", "fr")
    .option("--model <model>", "Modèle OpenAI", process.env.OPENAI_MODEL || "gpt-4o-mini")
    .parse(process.argv);

const options = program.opts();
const targetLangs: string[] = String(options.langs)
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);

if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY manquant");
    process.exit(1);
}

const client = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

async function translateText(text: string, targetLang: string, context: string): Promise<string> {
    const res = await client.chat.completions.create({
        model: options.model,
        messages: [
            {
                role: "system",
                content:
                    "Tu es un traducteur professionnel. Tu renvoies uniquement la traduction, sans guillemets, sans balises. Respecte le sens métier et conserve le format (phrases courtes).",
            },
            {
                role: "user",
                content: `Langue cible: ${targetLang}\nContexte: ${context}\nTexte: """${text.trim()}"""`,
            },
        ],
        temperature: 0.2,
    });

    const choice = res.choices[0]?.message?.content?.trim();
    if (!choice) {
        throw new Error("Réponse de traduction vide");
    }
    return choice;
}

type TranslateTarget = {
    entity: string;
    entityId: string;
    field: string;
    value: string | null;
};

async function shouldSkip(entity: string, entityId: string, field: string, langCode: string) {
    const existing = await prisma.translation.findUnique({
        where: {
            entity_entityId_field_langCode: {
                entity,
                entityId,
                field,
                langCode,
            },
        },
    });
    return !!existing;
}

async function translateBatch(records: TranslateTarget[], context: string) {
    for (const targetLang of targetLangs) {
        for (const rec of records) {
            if (!rec.value || !rec.value.trim()) continue;
            if (await shouldSkip(rec.entity, rec.entityId, rec.field, targetLang)) {
                continue;
            }
            try {
                const translated = await translateText(rec.value, targetLang, context);
                await upsertTranslationRow({
                    entity: rec.entity,
                    entityId: rec.entityId,
                    field: rec.field,
                    langCode: targetLang,
                    value: translated,
                });
                console.log(`✓ ${rec.entity}.${rec.field} (${rec.entityId}) -> ${targetLang}`);
            } catch (err) {
                console.error(`✗ Échec traduction ${rec.entity}.${rec.field} (${rec.entityId}) -> ${targetLang}:`, err);
            }
        }
    }
}

async function main() {
    const jobs = await prisma.job.findMany({select: {id: true, title: true, description: true}});
    await translateBatch(
        jobs.flatMap((j) => [
            {entity: "Job", entityId: j.id, field: "title", value: j.title},
            {entity: "Job", entityId: j.id, field: "description", value: j.description},
        ]),
        "Métier (Job)",
    );

    const jobFamilies = await prisma.jobFamily.findMany({select: {id: true, name: true}});
    await translateBatch(
        jobFamilies.map((jf) => ({entity: "JobFamily", entityId: jf.id, field: "name", value: jf.name})),
        "Famille de métiers (JobFamily)",
    );

    const families = await prisma.competenciesFamily.findMany({
        select: {id: true, name: true, description: true},
    });
    await translateBatch(
        families.flatMap((f) => [
            {entity: "CompetenciesFamily", entityId: f.id, field: "name", value: f.name},
            {entity: "CompetenciesFamily", entityId: f.id, field: "description", value: f.description},
        ]),
        "Famille de compétences (CompetenciesFamily)",
    );

    const subFamilies = await prisma.competenciesSubFamily.findMany({
        select: {id: true, name: true, description: true},
    });
    await translateBatch(
        subFamilies.flatMap((sf) => [
            {entity: "CompetenciesSubFamily", entityId: sf.id, field: "name", value: sf.name},
            {entity: "CompetenciesSubFamily", entityId: sf.id, field: "description", value: sf.description},
        ]),
        "Sous-famille de compétences (CompetenciesSubFamily)",
    );

    const competencies = await prisma.competency.findMany({
        select: {id: true, name: true, description: true},
    });
    await translateBatch(
        competencies.flatMap((c) => [
            {entity: "Competency", entityId: c.id, field: "name", value: c.name},
            {entity: "Competency", entityId: c.id, field: "description", value: c.description},
        ]),
        "Compétence (Competency)",
    );

    const quizzes = await prisma.quiz.findMany({
        select: {
            id: true,
            title: true,
            description: true,
            questions: {
                select: {
                    id: true,
                    text: true,
                    type: true,
                    responses: {
                        select: {
                            id: true,
                            text: true,
                            isCorrect: true,
                        },
                    },
                },
            },
        },
    });

    await translateBatch(
        quizzes.flatMap((q) => [
            {entity: "Quiz", entityId: q.id, field: "title", value: q.title},
            {entity: "Quiz", entityId: q.id, field: "description", value: q.description},
        ]),
        "Quiz (titre/description)",
    );

    const allQuestions = quizzes.flatMap((q) => q.questions);
    await translateBatch(
        allQuestions.map((qt) => ({
            entity: "QuizQuestion",
            entityId: qt.id,
            field: "text",
            value: qt.text,
        })),
        "Question de quiz (text)",
    );

    const allResponses = quizzes.flatMap((q) =>
        q.questions.flatMap((qt) =>
            qt.responses.map((r) => ({
                questionId: qt.id,
                id: r.id,
                text: r.text,
            }))
        )
    );

    await translateBatch(
        allResponses.map((r) => ({
            entity: "QuizResponse",
            entityId: r.id,
            field: "text",
            value: r.text,
        })),
        "Réponse de quiz (text)",
    );
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
