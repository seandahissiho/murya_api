/* eslint-disable no-console */
import {Prisma, PrismaClient, CompetencyType, Level, JobProgressionLevel, QuizQuestionType, QuizType} from '@prisma/client';
import path from 'node:path';
import xlsx from 'xlsx';

const prisma = new PrismaClient();

const JOB_FAMILY_NAME = 'BTS Ciel';
const EDLAB_DIR = path.resolve(__dirname, '..', 'edlab');
const SHOULD_RESET = process.argv.includes('--reset');

type SkillRow = {
    jobTitle: string;
    familyName: string;
    competencyName: string;
    competencyType: CompetencyType;
    level: Level;
};

type DiagramRow = {
    jobTitle: string;
    familyName: string;
    level: JobProgressionLevel;
    value: Prisma.Decimal;
};

type QuestionRow = {
    jobTitle: string;
    questionnaire: number;
    familyName: string;
    competencyName: string;
    questionText: string;
    proposition: string;
    isCorrect: boolean;
    timeLimitInSeconds: number | null;
};

type QuestionGroup = {
    jobTitle: string;
    questionnaire: number;
    familyName: string;
    competencyName: string;
    questionText: string;
    propositions: {text: string; isCorrect: boolean}[];
    timeLimitInSeconds: number | null;
};

function slugify(input: string): string {
    return input
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
}

function normalizeString(value: unknown): string {
    return String(value ?? '').trim();
}

function readWorkbook(fileName: string) {
    const filePath = path.join(EDLAB_DIR, fileName);
    return xlsx.readFile(filePath);
}

function mapLevel(value: string): Level {
    switch ((value || '').toLowerCase()) {
        case 'facile':
            return Level.EASY;
        case 'moyen':
            return Level.MEDIUM;
        case 'difficile':
            return Level.HARD;
        case 'expert':
            return Level.EXPERT;
        default:
            return Level.MEDIUM;
    }
}

function mapCompetencyType(value: string): CompetencyType {
    return value === 'Savoir-être' ? CompetencyType.SOFT_SKILL : CompetencyType.HARD_SKILL;
}

function mapProgressionLevel(value: string): JobProgressionLevel {
    switch ((value || '').toLowerCase()) {
        case 'debutant':
        case 'débutant':
        case 'junior':
            return JobProgressionLevel.JUNIOR;
        case 'intermédiaire':
        case 'intermediaire':
            return JobProgressionLevel.MIDLEVEL;
        case 'senior':
            return JobProgressionLevel.SENIOR;
        case 'expert':
            return JobProgressionLevel.EXPERT;
        default:
            return JobProgressionLevel.MIDLEVEL;
    }
}

function pointsForLevel(level: Level): number {
    switch (level) {
        case Level.EASY:
            return 100;
        case Level.MEDIUM:
            return 110;
        case Level.HARD:
            return 120;
        case Level.EXPERT:
            return 130;
        default:
            return 110;
    }
}

function loadTexts() {
    const wb = readWorkbook('edlab-base_texts.xlsx');
    const jobSheet = wb.Sheets['Métiers'];
    const familySheet = wb.Sheets['Familles'];

    const jobDescriptions = new Map<string, string>();
    const familyDescriptions = new Map<string, string>();

    if (jobSheet) {
        const rows = xlsx.utils.sheet_to_json<Record<string, any>>(jobSheet, {defval: null});
        for (const row of rows) {
            const jobTitle = normalizeString(row['Métier']);
            if (!jobTitle) continue;
            const paragraphs = Object.keys(row)
                .filter((key) => key.toLowerCase().startsWith('paragraphe'))
                .map((key) => row[key])
                .filter(Boolean);
            if (paragraphs.length) {
                jobDescriptions.set(jobTitle, paragraphs.join('\n\n'));
            }
        }
    }

    if (familySheet) {
        const rows = xlsx.utils.sheet_to_json<Record<string, any>>(familySheet, {defval: null});
        for (const row of rows) {
            const familyName = normalizeString(row['Famille']);
            if (!familyName) continue;
            const paragraph =
                row['Paragraphe'] ?? row['Paragraphe '] ?? row['Paragraphe 1'] ?? null;
            if (paragraph) {
                familyDescriptions.set(familyName, String(paragraph));
            }
        }
    }

    return {jobDescriptions, familyDescriptions};
}

function loadSkills(): SkillRow[] {
    const wb = readWorkbook('edlab-base_skills.xlsx');
    const rows: SkillRow[] = [];

    for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json<Record<string, any>>(sheet, {defval: null});
        for (const row of data) {
            const jobTitle = normalizeString(row['Métier'] ?? sheetName);
            const familyName = normalizeString(row['Famille']);
            const competencyName = normalizeString(row['Intitulé']);
            if (!jobTitle || !familyName || !competencyName) continue;
            rows.push({
                jobTitle,
                familyName,
                competencyName,
                competencyType: mapCompetencyType(normalizeString(row['Type'] ?? 'Savoir-faire')),
                level: mapLevel(normalizeString(row['Échelle'] ?? 'Moyen')),
            });
        }
    }

    return rows;
}

function loadDiagrams(): DiagramRow[] {
    const wb = readWorkbook('edlab-base_diagrams.xlsx');
    const rows: DiagramRow[] = [];

    for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json<Record<string, any>>(sheet, {defval: null});
        for (const row of data) {
            const jobTitle = normalizeString(row['Métier'] ?? sheetName);
            const familyName = normalizeString(row['Famille']);
            const level = normalizeString(row['Niveau']);
            const value = row['Valeur'];
            if (!jobTitle || !familyName || !level || value == null) continue;
            rows.push({
                jobTitle,
                familyName,
                level: mapProgressionLevel(level),
                value: new Prisma.Decimal(Number(value)),
            });
        }
    }

    return rows;
}

function loadQuestions(): QuestionRow[] {
    const wb = readWorkbook('edlab-base_questions.xlsx');
    const rows: QuestionRow[] = [];

    for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json<Record<string, any>>(sheet, {defval: null});

        let currentQuestionnaire: number | null = null;
        let currentFamily: string | null = null;
        let currentCompetency: string | null = null;
        let currentQuestion: string | null = null;

        for (const row of data) {
            const jobTitle = normalizeString(row['Métier'] ?? sheetName);
            if (row['Questionnaire'] != null) {
                currentQuestionnaire = Number(row['Questionnaire']);
            }
            if (row['Famille']) {
                currentFamily = normalizeString(row['Famille']);
            }
            if (row['Intitulé']) {
                currentCompetency = normalizeString(row['Intitulé']);
            }
            if (row['Question']) {
                currentQuestion = normalizeString(row['Question']);
            }
            if (!jobTitle || currentQuestionnaire == null || !currentFamily || !currentCompetency || !currentQuestion) {
                continue;
            }
            if (!row['Proposition']) continue;

            const response = normalizeString(row['Réponse'] ?? '').toUpperCase();
            const timeRaw = row['Temps (s)'] ?? row['Temps'] ?? row['Temps(s)'];
            const timeLimit = timeRaw == null || timeRaw === '' ? null : Number(timeRaw);
            rows.push({
                jobTitle,
                questionnaire: currentQuestionnaire,
                familyName: currentFamily,
                competencyName: currentCompetency,
                questionText: currentQuestion,
                proposition: normalizeString(row['Proposition']),
                isCorrect: response === 'VRAI',
                timeLimitInSeconds: Number.isFinite(timeLimit) ? timeLimit : null,
            });
        }
    }

    return rows;
}

export async function seedBtsCiel(options?: {reset?: boolean}) {
    const shouldReset = options?.reset ?? SHOULD_RESET;
    console.log('Seeding BTS Ciel from edlab excels...');

    const {jobDescriptions, familyDescriptions} = loadTexts();
    const skills = loadSkills();
    const diagrams = loadDiagrams();
    const questions = loadQuestions();

    if (shouldReset) {
        console.log('Reset BTS Ciel content before seeding...');

        const existingJobFamily = await prisma.jobFamily.findUnique({
            where: {name: JOB_FAMILY_NAME},
            select: {id: true},
        });

        if (existingJobFamily) {
            const jobs = await prisma.job.findMany({
                where: {jobFamilyId: existingJobFamily.id},
                select: {id: true, slug: true},
            });
            const jobIds = jobs.map((job) => job.id);

            const jobCompetencies = await prisma.job.findMany({
                where: {id: {in: jobIds}},
                select: {competencies: {select: {id: true}}},
            });

            const competencyIds = Array.from(
                new Set(jobCompetencies.flatMap((job) => job.competencies.map((c) => c.id)))
            );

            await prisma.$transaction(async (tx) => {
                if (jobIds.length) {
                    await tx.userQuiz.deleteMany({
                        where: {quiz: {jobId: {in: jobIds}}},
                    });
                    await tx.quiz.deleteMany({
                        where: {jobId: {in: jobIds}},
                    });
                    await tx.jobKiviat.deleteMany({
                        where: {jobId: {in: jobIds}},
                    });
                    await tx.jobSubfamilyCompetency.deleteMany({
                        where: {jobId: {in: jobIds}},
                    });
                    await tx.job.deleteMany({
                        where: {id: {in: jobIds}},
                    });
                }

                if (competencyIds.length) {
                    await tx.competency.deleteMany({
                        where: {id: {in: competencyIds}},
                    });
                }

                await tx.jobFamily.delete({
                    where: {id: existingJobFamily.id},
                });
            });
        }
    }

    const jobFamily = await prisma.jobFamily.upsert({
        where: {name: JOB_FAMILY_NAME},
        update: {slug: slugify(JOB_FAMILY_NAME), updatedAt: new Date()},
        create: {
            name: JOB_FAMILY_NAME,
            slug: slugify(JOB_FAMILY_NAME),
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const familyNames = new Set<string>([
        ...skills.map((row) => row.familyName),
        ...diagrams.map((row) => row.familyName),
    ]);

    const familyMap = new Map<string, {familyId: string}>();

    const ensureFamilyIds = async (familyName: string) => {
        const existing = familyMap.get(familyName);
        if (existing) return existing;

        const family = await prisma.competenciesFamily.upsert({
            where: {name: familyName},
            update: {
                slug: slugify(familyName),
                description: familyDescriptions.get(familyName) ?? undefined,
                updatedAt: new Date(),
            },
            create: {
                name: familyName,
                slug: slugify(familyName),
                description: familyDescriptions.get(familyName) ?? null,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        });

        const ids = {familyId: family.id};
        familyMap.set(familyName, ids);
        return ids;
    };

    for (const familyName of familyNames) {
        await ensureFamilyIds(familyName);
    }

    const jobTitles = Array.from(new Set(skills.map((row) => row.jobTitle)));
    const jobMap = new Map<string, {id: string}>();

    for (const jobTitle of jobTitles) {
        const job = await prisma.job.upsert({
            where: {slug: slugify(jobTitle)},
            update: {
                title: jobTitle,
                jobFamilyId: jobFamily.id,
                description: jobDescriptions.get(jobTitle) ?? undefined,
                isActive: true,
                updatedAt: new Date(),
            },
            create: {
                title: jobTitle,
                slug: slugify(jobTitle),
                description: jobDescriptions.get(jobTitle) ?? null,
                jobFamilyId: jobFamily.id,
                isActive: true,
                popularity: 0,
                backgroundColor: '#FFFFFFFF',
                foregroundColor: '#FFFFFFFF',
                textColor: '#FFFFFFFF',
                overlayColor: '#FFFFFFFF',
                imageIndex: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        });

        jobMap.set(jobTitle, {id: job.id});
    }

    const competencyMap = new Map<string, {id: string; level: Level}>();

    for (const row of skills) {
        const job = jobMap.get(row.jobTitle);
        const family = await ensureFamilyIds(row.familyName);
        if (!job || !family) continue;

        const competencySlug = slugify(`${row.jobTitle}-${row.competencyName}`);
        const competency = await prisma.competency.upsert({
            where: {slug: competencySlug},
            update: {
                name: row.competencyName,
                type: row.competencyType,
                level: row.level,
                updatedAt: new Date(),
            },
            create: {
                name: row.competencyName,
                slug: competencySlug,
                description: null,
                type: row.competencyType,
                level: row.level,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        });

        await prisma.competency.update({
            where: {id: competency.id},
            data: {
                families: {
                    connect: [{id: family.familyId}],
                },
            },
        });

        await prisma.job.update({
            where: {id: job.id},
            data: {
                competencies: {connect: {id: competency.id}},
                competenciesFamilies: {connect: {id: family.familyId}},
            },
        });

        competencyMap.set(`${row.jobTitle}::${row.competencyName}`, {
            id: competency.id,
            level: row.level,
        });
    }

    for (const row of diagrams) {
        const job = jobMap.get(row.jobTitle);
        const family = familyMap.get(row.familyName);
        if (!job || !family) continue;

        await prisma.jobKiviat.upsert({
            where: {
                jobId_competenciesFamilyId_level: {
                    jobId: job.id,
                    competenciesFamilyId: family.familyId,
                    level: row.level,
                },
            },
            update: {
                rawScore0to10: Number(row.value) * 2,
                radarScore0to5: Number(row.value),
                continuous0to10: Number(row.value) * 2,
                masteryAvg0to1: Number(row.value) / 5,
                updatedAt: new Date(),
            },
            create: {
                jobId: job.id,
                competenciesFamilyId: family.familyId,
                level: row.level,
                rawScore0to10: Number(row.value) * 2,
                radarScore0to5: Number(row.value),
                continuous0to10: Number(row.value) * 2,
                masteryAvg0to1: Number(row.value) / 5,
                updatedAt: new Date(),
            },
        });
    }

    const questionGroups = new Map<string, QuestionGroup>();
    for (const row of questions) {
        const key = `${row.jobTitle}::${row.questionnaire}::${row.questionText}`;
        const group = questionGroups.get(key) ?? {
            jobTitle: row.jobTitle,
            questionnaire: row.questionnaire,
            familyName: row.familyName,
            competencyName: row.competencyName,
            questionText: row.questionText,
            propositions: [],
            timeLimitInSeconds: row.timeLimitInSeconds,
        };
        if (group.timeLimitInSeconds == null && row.timeLimitInSeconds != null) {
            group.timeLimitInSeconds = row.timeLimitInSeconds;
        }
        group.propositions.push({text: row.proposition, isCorrect: row.isCorrect});
        questionGroups.set(key, group);
    }

    const groupsByJobQuiz = new Map<string, QuestionGroup[]>();
    for (const group of questionGroups.values()) {
        const key = `${group.jobTitle}::${group.questionnaire}`;
        const list = groupsByJobQuiz.get(key) ?? [];
        list.push(group);
        groupsByJobQuiz.set(key, list);
    }

    for (const [key, groups] of groupsByJobQuiz.entries()) {
        const [jobTitle, questionnaireRaw] = key.split('::');
        const questionnaire = Number(questionnaireRaw);

        const existingQuiz = await prisma.quiz.findFirst({
            where: {
                jobFamilyId: jobFamily.id,
                type: QuizType.POSITIONING,
                title: `Questionnaire ${questionnaire}`,
            },
            select: {id: true},
        });
        if (existingQuiz) {
            console.log(`Quiz déjà existant pour BTS Ciel / Questionnaire ${questionnaire}, skip.`);
            continue;
        }

        await prisma.quiz.create({
            data: {
                jobId: null,
                jobFamilyId: jobFamily.id,
                title: `Questionnaire ${questionnaire}`,
                description: null,
                type: QuizType.POSITIONING,
                isActive: true,
                level: Level.MEDIUM,
                items: {
                    create: groups.map((group, index) => {
                        const competency = competencyMap.get(`${jobTitle}::${group.competencyName}`);
                        if (!competency) {
                            throw new Error(`Compétence introuvable pour "${jobTitle}" / "${group.competencyName}".`);
                        }
                        return {
                            index,
                            question: {
                                create: {
                                    text: group.questionText,
                                    competencyId: competency.id,
                                    defaultTimeLimitS: group.timeLimitInSeconds ?? 30,
                                    level: competency.level ?? Level.MEDIUM,
                                    defaultPoints: pointsForLevel(competency.level ?? Level.MEDIUM),
                                    type: QuizQuestionType.single_choice,
                                    responses: {
                                        create: group.propositions.map((prop, propIndex) => ({
                                            text: prop.text,
                                            isCorrect: prop.isCorrect,
                                            index: propIndex,
                                        })),
                                    },
                                },
                            },
                        };
                    }),
                },
            },
        });
    }

    console.log('Seed BTS Ciel termine.');
}

if (require.main === module) {
    seedBtsCiel()
        .catch((err) => {
            console.error(err);
            process.exit(1);
        })
        .finally(async () => {
            await prisma.$disconnect();
        });
}
