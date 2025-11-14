/*
 * Génération du contenu sémantique pour un job (partie 2).
 *
 * Ce module encapsule la logique de génération et de validation d'un
 * "JobSpec" – un objet contenant toutes les informations nécessaires
 * concernant le job, sa famille, ses familles de compétences, ses
 * compétences et un quiz de positionnement. Dans un environnement
 * production, ces fonctions feraient appel à une IA (par exemple via
 * l'API OpenAI) pour produire un contenu adapté. Ici, des stubs sont
 * fournis avec un exemple minimal pour illustrer la structure.
 */

// -----------------------------------------------------------------------------
//  Typescript interfaces décrivant la structure du JobSpec
//
// Ces interfaces permettent d'annoter correctement le retour de la
// génération afin de faciliter la validation et l'usage ultérieur.

export interface JobSpec {
    job: {
        title: string;
        description: string;
    };
    jobFamily: {
        name: string;
    };
    competencyFamilies: Array<{
        name: string;
        kind: 'HARD' | 'SOFT';
        description?: string;
    }>;
    competencies: Array<{
        name: string;
        type: 'HARD_SKILL' | 'SOFT_SKILL';
        level: 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT';
        family: string; // référence par nom de famille
        scores?: {
            beginner: number;
            intermediate: number;
            advanced: number;
            expert: number;
            max: number;
        };
    }>;
    quiz: {
        questions: Array<QuizQuestionSpec>;
    };
}

export interface QuizQuestionSpec {
    text: string;
    type: 'single_choice' | 'multiple_choice' | 'true_false' | 'short_answer' | 'fill_in_the_blank';
    timeLimitInSeconds: number;
    points: number;
    responses: Array<{
        text: string;
        isCorrect: boolean;
    }>;
    competencies: Array<{
        name: string; // nom de la compétence
        weight?: number;
        maxPoints?: number;
    }>;
}

// -----------------------------------------------------------------------------
//  Generation stub
//
// Dans un vrai environnement, la fonction ci-dessous enverrait un prompt à
// l'API d'un modèle linguistique pour obtenir un contenu réaliste et
// structuré. Pour cet exercice, nous fournissons un contenu d'exemple
// déterministe afin de permettre au reste du flux de fonctionner.

/**
 * Génère un JobSpec pour un job donné. Fonction stub à adapter avec une
 * requête OpenAI ou autre moteur IA. Les valeurs retournées ici sont
 * purement illustratives et doivent être remplacées par des données
 * pertinentes.
 *
 * @param jobName Nom du job (pivot pour la génération)
 * @param defaultLang Langue pivot (non utilisée dans le stub)
 * @returns Un JobSpec complet prêt à être normalisé et persisté
 */
export async function generateJobSpec(jobName: string, defaultLang: string): Promise<JobSpec> {
    // Exemple minimaliste : crée une famille de métier portant le même nom
    // que le job, une famille de compétences HARD, deux compétences et
    // deux questions de quiz.
    const jobFamilyName = jobName;
    return {
        job: {
            title: jobName,
            description: `Description auto-générée pour le poste de ${jobName}.`,
        },
        jobFamily: {
            name: jobFamilyName,
        },
        competencyFamilies: [
            {
                name: `${jobName} Core Skills`,
                kind: 'HARD',
                description: `Famille de compétences techniques pour le poste de ${jobName}.`,
            },
            {
                name: `${jobName} Soft Skills`,
                kind: 'SOFT',
                description: `Famille de compétences comportementales pour le poste de ${jobName}.`,
            },
        ],
        competencies: [
            {
                name: `${jobName} Technical Skill 1`,
                type: 'HARD_SKILL',
                level: 'MEDIUM',
                family: `${jobName} Core Skills`,
                scores: {beginner: 1, intermediate: 2, advanced: 3, expert: 4, max: 5},
            },
            {
                name: `${jobName} Behavioural Skill 1`,
                type: 'SOFT_SKILL',
                level: 'EASY',
                family: `${jobName} Soft Skills`,
                scores: {beginner: 1, intermediate: 2, advanced: 3, expert: 4, max: 5},
            },
        ],
        quiz: {
            questions: [
                {
                    text: `Quelle est la principale responsabilité d'un ${jobName} ?`,
                    type: 'single_choice',
                    timeLimitInSeconds: 30,
                    points: 2,
                    responses: [
                        {text: 'Responsabilité 1', isCorrect: true},
                        {text: 'Responsabilité 2', isCorrect: false},
                        {text: 'Responsabilité 3', isCorrect: false},
                    ],
                    competencies: [
                        {name: `${jobName} Technical Skill 1`, weight: 2},
                        {name: `${jobName} Behavioural Skill 1`, weight: 1},
                    ],
                },
                {
                    text: `Un ${jobName} doit-il travailler en équipe ?`,
                    type: 'true_false',
                    timeLimitInSeconds: 20,
                    points: 1,
                    responses: [
                        {text: 'Vrai', isCorrect: true},
                        {text: 'Faux', isCorrect: false},
                    ],
                    competencies: [
                        {name: `${jobName} Behavioural Skill 1`, weight: 1},
                    ],
                },
            ],
        },
    };
}

// -----------------------------------------------------------------------------
//  Traduction stub
//
// Cette fonction illustre la traduction du contenu généré dans d'autres
// langues. Le comportement ici consiste à apposer une mention « (traduit)
// [lang] » après chaque chaîne afin d'identifier visuellement les traductions
// générées. Dans un vrai système, on interrogerait un moteur de traduction.

export interface Translations {
    [lang: string]: {
        job: {
            title: string;
            description: string;
        };
        jobFamily: {
            name: string;
        };
        competencyFamilies: Record<string, { name: string; description?: string }>; // par nom d'origine
        competencies: Record<string, { name: string }>; // par nom d'origine
        quiz: {
            questions: Array<{
                text: string;
                responses: Array<{ text: string }>;
            }>;
        };
    };
}

/**
 * Génère des traductions pour un JobSpec. Cette fonction est un stub qui
 * appose une indication « (traduit en <lang>) » sur chaque champ textuel.
 *
 * @param spec JobSpec généré par generateJobSpec
 * @param langs Liste des langues à traduire (doit exclure la langue par défaut)
 * @param defaultLang Langue pivot (non traduite)
 */
export async function generateTranslations(
    spec: JobSpec,
    langs: string[],
    defaultLang: string,
): Promise<Translations> {
    const translations: Translations = {};
    for (const lang of langs) {
        if (lang === defaultLang) continue;
        translations[lang] = {
            job: {
                title: `${spec.job.title} (traduit en ${lang})`,
                description: `${spec.job.description} (traduit en ${lang})`,
            },
            jobFamily: {
                name: `${spec.jobFamily.name} (traduit en ${lang})`,
            },
            competencyFamilies: {},
            competencies: {},
            quiz: {
                questions: [],
            },
        };
        // Traductions des familles de compétences
        for (const fam of spec.competencyFamilies) {
            translations[lang].competencyFamilies[fam.name] = {
                name: `${fam.name} (traduit en ${lang})`,
                description: fam.description ? `${fam.description} (traduit en ${lang})` : undefined,
            };
        }
        // Traductions des compétences
        for (const comp of spec.competencies) {
            translations[lang].competencies[comp.name] = {
                name: `${comp.name} (traduit en ${lang})`,
            };
        }
        // Traductions du quiz
        translations[lang].quiz.questions = spec.quiz.questions.map((q) => ({
            text: `${q.text} (traduit en ${lang})`,
            responses: q.responses.map((r) => ({
                text: `${r.text} (traduit en ${lang})`,
            })),
        }));
    }
    return translations;
}

// -----------------------------------------------------------------------------
//  Validation basique
//
// Les règles de validation imposent des conditions minimales sur le quiz
// (par exemple au moins une réponse correcte pour les questions single_choice
// ou true_false). Cette fonction lancera une erreur si une condition est
// violée. D'autres validations pourront être ajoutées au besoin.

/**
 * Vérifie l'intégrité d'un JobSpec. Lance une erreur en cas
 * d'incohérence.
 *
 * @param spec JobSpec à valider
 */
export function validateJobSpec(spec: JobSpec): void {
    if (!spec.job.title || !spec.job.description) {
        throw new Error('Le job doit avoir un titre et une description.');
    }
    if (spec.quiz.questions.length < 1) {
        throw new Error('Le quiz doit contenir au moins une question.');
    }
    for (const q of spec.quiz.questions) {
        if (q.type === 'single_choice' || q.type === 'true_false') {
            const correctCount = q.responses.filter((r) => r.isCorrect).length;
            if (correctCount === 0) {
                throw new Error(`La question "${q.text}" doit avoir au moins une réponse correcte.`);
            }
            if (q.type === 'true_false' && q.responses.length !== 2) {
                throw new Error(`La question true_false "${q.text}" doit avoir exactement deux réponses.`);
            }
        }
        if (q.points <= 0) {
            throw new Error(`La question "${q.text}" doit avoir un nombre de points positif.`);
        }
    }
}
