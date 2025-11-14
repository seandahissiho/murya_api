/*
 * Persistance du JobSpec dans la base de données (partie 3).
 *
 * Ce module prend en entrée un JobSpec généré (voir job-spec-generator.ts)
 * ainsi qu'un ensemble de traductions, puis crée ou met à jour toutes les
 * entités nécessaires dans la base de données à l'aide de Prisma.
 *
 * Les opérations sont exécutées dans une transaction pour assurer
 * l'atomicité. Les fonctions d'upsert exportées depuis generate-job.ts sont
 * utilisées pour éviter les doublons. La logique de traduction est
 * implémentée ici sous forme de upsert sur la table Translation.
 */

import {PrismaClient} from '@prisma/client';
import {JobSpec, Translations} from './job-spec-generator';
import {normalizeName, upsertCompetenciesFamily, upsertCompetency, upsertJobFamily,} from './generate-job';
import {prisma} from "./src/config/db";

// -----------------------------------------------------------------------------
//  Helper interne pour upsert d'une traduction
//
// Cette fonction insère ou met à jour une entrée de traduction pour un
// couple (entity, entityId, field, langCode). Elle est utilisée par
// persistJobSpec afin de stocker toutes les traductions provenant de
// generateTranslations().

async function upsertTranslation(
    tx: PrismaClient,
    entity: string,
    entityId: string,
    field: string,
    langCode: string,
    value: string,
    force: boolean,
): Promise<void> {
    // L'index unique est défini sur (entity, entityId, field, langCode)
    const where = {
        entity_entityId_field_langCode: {
            entity,
            entityId,
            field,
            langCode,
        },
    } as const;
    if (force) {
        // Utilise upsert pour écraser la valeur existante si présent
        await tx.translation.upsert({
            where,
            update: {value},
            create: {entity, entityId, field, langCode, value},
        });
    } else {
        // Vérifie d'abord l'existence
        const existing = await tx.translation.findUnique({where});
        if (!existing) {
            await tx.translation.create({data: {entity, entityId, field, langCode, value}});
        }
    }
}

// -----------------------------------------------------------------------------
//  Fonction principale : persistance d'un JobSpec et de ses traductions

/**
 * Persiste un JobSpec et ses traductions en base de données.
 *
 * @param spec Le JobSpec généré
 * @param translations Dictionnaire des traductions par langue (voir generateTranslations)
 * @param langs Liste des langues à traiter (langue pivot incluse)
 * @param defaultLang Code de la langue pivot (pas de traduction pour celle-ci)
 * @param force Si vrai, écrase les traductions existantes au lieu de les ignorer
 * @returns Identifiants clés : id du job, id de la famille de job et id du quiz
 */
export async function persistJobSpec(
    spec: JobSpec,
    translations: Translations,
    langs: string[],
    defaultLang: string,
    force = false,
): Promise<{ jobId: string; jobFamilyId: string; quizId: string }> {
    try {
        const result = await prisma.$transaction(async (tx: any) => {
            // 1) Upsert JobFamily
            const jobFamily = await upsertJobFamily(spec.jobFamily.name);

            // 2) Upsert Competency families
            const familiesMap: Map<string, { id: string }> = new Map();
            for (const famSpec of spec.competencyFamilies) {
                const fam = await upsertCompetenciesFamily(famSpec.name);
                // Met à jour la description si présente dans le spec
                if (famSpec.description) {
                    await tx.competenciesFamily.update({
                        where: {id: fam.id},
                        data: {description: famSpec.description},
                    });
                }
                familiesMap.set(famSpec.name, {id: fam.id});
            }

            // 3) Upsert competencies et liaisons
            const competenciesMap: Map<string, { id: string }> = new Map();
            for (const compSpec of spec.competencies) {
                // Création ou récupération
                const comp = await upsertCompetency(compSpec.name);
                // Mise à jour des propriétés (type, niveau, scores)
                await tx.competency.update({
                    where: {id: comp.id},
                    data: {
                        type: compSpec.type,
                        level: compSpec.level,
                        beginnerScore: compSpec.scores?.beginner ?? comp.beginnerScore,
                        intermediateScore: compSpec.scores?.intermediate ?? comp.intermediateScore,
                        advancedScore: compSpec.scores?.advanced ?? comp.advancedScore,
                        expertScore: compSpec.scores?.expert ?? comp.expertScore,
                        maxScore: compSpec.scores?.max ?? comp.maxScore,
                    },
                });
                // Association à la famille
                const familyRef = familiesMap.get(compSpec.family);
                if (familyRef) {
                    await tx.competency.update({
                        where: {id: comp.id},
                        data: {
                            families: {
                                // connect s'assure qu'il n'y ait pas de doublon dans la table de jonction
                                connect: [{id: familyRef.id}],
                            },
                        },
                    });
                }
                competenciesMap.set(compSpec.name, {id: comp.id});
            }

            // 4) Upsert Job
            const normalizedJobName = normalizeName(spec.job.title);
            let job = await tx.job.findFirst({where: {normalizedName: normalizedJobName}});
            if (!job) {
                job = await tx.job.create({
                    data: {
                        jobFamilyId: jobFamily.id,
                        title: spec.job.title,
                        normalizedName: normalizedJobName,
                        description: spec.job.description,
                        backgroundColor: '#FFFFFFFF',
                        foregroundColor: '#FFFFFFFF',
                        textColor: '#FFFFFFFF',
                        overlayColor: '#FFFFFFFF',
                        imageIndex: 0,
                        isActive: true,
                    },
                });
            } else {
                job = await tx.job.update({
                    where: {id: job.id},
                    data: {
                        jobFamilyId: jobFamily.id,
                        title: spec.job.title,
                        description: spec.job.description,
                        // ne modifie pas colors/imageIndex
                    },
                });
            }

            // 5) Création du quiz
            const quiz = await tx.quiz.create({
                data: {},
            });
            // Tableau pour stocker les id des questions, utile pour traductions
            const questionIds: string[] = [];
            let questionIndex = 0;
            for (const q of spec.quiz.questions) {
                const question = await tx.quizQuestion.create({
                    data: {
                        quizId: quiz.id,
                        text: q.text,
                        type: q.type,
                        timeLimitInSeconds: q.timeLimitInSeconds,
                        points: q.points,
                        metadata: null,
                        position: questionIndex++,
                    },
                });
                questionIds.push(question.id);
                // Réponses
                let responseIndex = 0;
                for (const resp of q.responses) {
                    await tx.quizResponse.create({
                        data: {
                            questionId: question.id,
                            text: resp.text,
                            metadata: null,
                            isCorrect: resp.isCorrect,
                            points: resp.isCorrect ? q.points : 0,
                            index: responseIndex++,
                        },
                    });
                }
                // Liaisons aux compétences
                for (const compLink of q.competencies) {
                    const compRef = competenciesMap.get(compLink.name);
                    if (!compRef) {
                        throw new Error(`La compétence « ${compLink.name} » n'a pas été trouvée lors du mappage.`);
                    }
                    await tx.quizQuestionCompetency.create({
                        data: {
                            questionId: question.id,
                            competencyId: compRef.id,
                            weight: compLink.weight ?? 1,
                            maxPoints: compLink.maxPoints ?? null,
                        },
                    });
                }
            }
            // Mise à jour du job avec l'id du quiz
            job = await tx.job.update({
                where: {id: job.id},
                data: {positioningQuizId: quiz.id},
            });

            // 6) Insertion des traductions
            // On insère pour chaque langue, exceptée la langue par défaut
            for (const lang of langs) {
                if (lang === defaultLang) continue;
                const trans = translations[lang];
                if (!trans) continue;
                // Job
                await upsertTranslation(tx, 'Job', job.id, 'title', lang, trans.job.title, force);
                await upsertTranslation(tx, 'Job', job.id, 'description', lang, trans.job.description, force);
                // JobFamily
                await upsertTranslation(tx, 'JobFamily', jobFamily.id, 'name', lang, trans.jobFamily.name, force);
                // CompetencyFamilies
                for (const famSpec of spec.competencyFamilies) {
                    const famRef = familiesMap.get(famSpec.name);
                    if (!famRef) continue;
                    const famTrans = trans.competencyFamilies[famSpec.name];
                    if (!famTrans) continue;
                    await upsertTranslation(tx, 'CompetenciesFamily', famRef.id, 'name', lang, famTrans.name, force);
                    if (famTrans.description) {
                        await upsertTranslation(tx, 'CompetenciesFamily', famRef.id, 'description', lang, famTrans.description, force);
                    }
                }
                // Competencies
                for (const compSpec of spec.competencies) {
                    const compRef = competenciesMap.get(compSpec.name);
                    if (!compRef) continue;
                    const compTrans = trans.competencies[compSpec.name];
                    if (!compTrans) continue;
                    await upsertTranslation(tx, 'Competency', compRef.id, 'name', lang, compTrans.name, force);
                }
                // Quiz : questions et réponses
                for (let i = 0; i < spec.quiz.questions.length; i++) {
                    const qSpec = spec.quiz.questions[i];
                    const questionId = questionIds[i];
                    const qTrans = trans.quiz.questions[i];
                    if (!qTrans) continue;
                    await upsertTranslation(tx, 'QuizQuestion', questionId, 'text', lang, qTrans.text, force);
                    // Réponses
                    // On récupère les réponses via findMany car on ne les a pas conservées dans un tableau séparé
                    const responses = await tx.quizResponse.findMany({where: {questionId}, orderBy: {index: 'asc'}});
                    if (responses.length !== qSpec.responses.length) {
                        throw new Error('Incohérence entre le nombre de réponses et les traductions fournies.');
                    }
                    for (let j = 0; j < responses.length; j++) {
                        const response = responses[j];
                        const respTrans = qTrans.responses[j];
                        if (!respTrans) continue;
                        await upsertTranslation(tx, 'QuizResponse', response.id, 'text', lang, respTrans.text, force);
                    }
                }
            }

            return {jobId: job.id, jobFamilyId: jobFamily.id, quizId: quiz.id};
        });
        return result;
    } finally {
        await prisma.$disconnect();
    }
}
