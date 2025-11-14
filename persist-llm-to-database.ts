import {promises as fs} from "fs";
import * as path from "path";
import {prisma} from "./src/config/db";
import {CompetencyType, Level} from "@prisma/client";

interface CompetencyDto {
    kind: string;               // e.g. "SavoirFaire" / "SavoirÊtre"
    name: string;
    slug: string;
    acquisitionLevel: string;   // e.g. "Facile", "Moyen", "Difficile", "Expert"
    description: string;
    beginnerScore?: number;
    intermediateScore?: number;
    advancedScore?: number;
    expertScore?: number;
}

interface SubFamilyDto {
    name: string;
    slug: string;
    competencies: CompetencyDto[];
}

interface FamilyDto {
    name: string;
    slug: string;
    subFamilies: SubFamilyDto[];
}

interface JobDto {
    jobTitle: string;
    jobDescription: string;
    normalizedJobName: string;
    families: FamilyDto[];
    positioningQuizzes: string[];
}

// Interfaces for quiz JSONs
interface QuizResponseDto {
    text: string;
    metadata: unknown | null;
    isCorrect: boolean;
    index: number;
}

interface QuizQuestionDto {
    text: string;
    timeLimitInSeconds: number;
    points: number;
    type: string;
    mediaUrl: string;
    index: number;
    metadata: unknown | null;
    responses: QuizResponseDto[];
    competencySlug: string;
}

interface QuizDto {
    title: string;
    description: string;
    level: Level;
    questions: QuizQuestionDto[];
}

async function loadJobDto(filePath: string): Promise<JobDto> {
    const absolute = path.resolve(filePath);
    const raw = await fs.readFile(absolute, {encoding: "utf-8"});
    const obj = JSON.parse(raw) as JobDto;

    // Basic runtime check (optional)
    if (!obj.jobTitle || !Array.isArray(obj.positioningQuizzes)) {
        throw new Error(`Invalid JobDto JSON at ${filePath}`);
    }

    return obj;
}

async function loadQuiz(filePath: string): Promise<QuizDto> {
    const absolute = path.resolve(filePath);
    const raw = await fs.readFile(absolute, {encoding: "utf-8"});
    const obj = JSON.parse(raw) as QuizDto;

    if (!Array.isArray(obj.questions)) {
        throw new Error(`Invalid Quiz JSON at ${filePath}`);
    }

    return obj;
}

async function loadJobWithQuizzes(jobFilePath: string): Promise<{ job: JobDto; quizzes: QuizDto[] }> {
    const job = await loadJobDto(jobFilePath);
    const quizzes: QuizDto[] = [];

    for (const quizRelPath of job.positioningQuizzes) {
        // If the quiz paths are relative to the job file location:
        const absolute = path.resolve(quizRelPath);
        const quiz = await loadQuiz(absolute);
        quizzes.push(quiz);
    }

    return {job, quizzes};
}

function levelMapper(acquisitionLevel: string) {
    switch (acquisitionLevel.toLowerCase()) {
        case "facile":
            return Level.EASY;
        case "moyen":
            return Level.MEDIUM;
        case "difficile":
            return Level.HARD;
        case "expert":
            return Level.EXPERT;
            case "mix":
            return Level.MIX;
        default:
            return Level.EASY;
    }
}

async function persistCompetencyFamiliesAndCompetencies(job: JobDto) {
    const families: any[] = [];
    const comp: any[] = [];
    for (const family of job.families) {
        const familyRecord = await prisma.competenciesFamily.upsert({
            where: {normalizedName: family.slug},
            update: {name: family.name},
            create: {
                name: family.name,
                normalizedName: family.slug,
            },
        });
        for (const subFamily of family.subFamilies) {
            const subFamilyRecord = await prisma.competenciesFamily.upsert({
                where: {normalizedName: subFamily.slug},
                update: {name: subFamily.name, parentId: familyRecord.id},
                create: {
                    name: subFamily.name,
                    normalizedName: subFamily.slug,
                    parentId: familyRecord.id,
                },
            });
            for (const competency of subFamily.competencies) {
                const compRecord = await prisma.competency.upsert({
                    where: {normalizedName: competency.slug},
                    update: {
                        name: competency.name,
                        type: competency.kind === "SavoirFaire" ? CompetencyType.HARD_SKILL : CompetencyType.SOFT_SKILL,
                        beginnerScore: competency.beginnerScore,
                        intermediateScore: competency.intermediateScore,
                        advancedScore: competency.advancedScore,
                        expertScore: competency.expertScore,
                        maxScore: 5,
                        families: {connect: [{id: subFamilyRecord.id}]},
                        level: levelMapper(competency.acquisitionLevel),
                    },
                    create: {
                        name: competency.name,
                        normalizedName: competency.slug,
                        type: competency.kind === "SavoirFaire" ? CompetencyType.HARD_SKILL : CompetencyType.SOFT_SKILL,
                        beginnerScore: competency.beginnerScore,
                        intermediateScore: competency.intermediateScore,
                        advancedScore: competency.advancedScore,
                        expertScore: competency.expertScore,
                        maxScore: 5.0,
                        families: {connect: [{id: subFamilyRecord.id}]},
                        level: levelMapper(competency.acquisitionLevel),
                    },
                });
                comp.push(compRecord);
            }
            // link competencies to subFamily
            await prisma.competenciesFamily.update({
                where: {id: subFamilyRecord.id},
                data: {
                    competencies: {
                        connect: subFamily.competencies.map(c => ({normalizedName: c.slug})),
                    },
                },
            });
            // link subFamily to family
            await prisma.competenciesFamily.update({
                where: {id: familyRecord.id},
                data: {
                    children: {
                        connect: {id: subFamilyRecord.id},
                    },
                },
            });
        }
        // link competencies to family
        for (const subFamily of family.subFamilies) {
            for (const competency of subFamily.competencies) {
                await prisma.competenciesFamily.update({
                    where: {id: familyRecord.id},
                    data: {
                        competencies: {
                            connect: {normalizedName: competency.slug},
                        },
                    },
                });
            }
        }
        families.push(familyRecord);
    }
    return {comp, families};
}

async function persistJobAndQuizzesToDatabase(job: JobDto, quizzes: QuizDto[]) {

    // delete all quizzes linked to this job
    await prisma.job.deleteMany({where: {normalizedName: job.normalizedJobName}});

    const {comp, families} = await persistCompetencyFamiliesAndCompetencies(job);

    let job2 = await prisma.job.upsert({
        where: {normalizedName: job.normalizedJobName},
        update: {
            title: job.jobTitle,
            description: job.jobDescription,
        },
        create: {
            title: job.jobTitle,
            normalizedName: job.normalizedJobName,
            description: job.jobDescription,
            competencies: {connect: comp.map((c: any) => ({id: c.id}))},
            competenciesFamilies: {
                connect: families.map((f: any) => ({id: f.id})),
            },
        }
    });

    const quizRecords: any[] = [];
    for (const quiz of quizzes) {
        const quizRecord = await prisma.quiz.create({
            data: {
                jobId: job2.id,
                title: quiz.title,
                description: quiz.description,
                level: quiz.level,
                questions: {}
            },
        });

        const quizQuestions: any[] = [];
        for (const question of quiz.questions) {
            const linkedCompetency = await prisma.competency.findFirst({
                where: {
                    normalizedName: question.competencySlug
                },
            });
            if (!linkedCompetency) {
                throw new Error(`Competency not found for question: ${question.text}`);
            }
            const createdQuestion = await prisma.quizQuestion.create({
                data: {
                    // quizId: quizRecord.id,
                    // competencyId: linkedCompetency.id,
                    text: question.text,
                    timeLimitInSeconds: question.timeLimitInSeconds,
                    points: question.points,
                    index: question.index,
                    quiz: {
                        connect: {id: quizRecord.id}
                    },
                    competency: {
                        connect: {id: linkedCompetency.id}
                    }
                },
            });
            if (!createdQuestion) {
                throw new Error(`Failed to create question: ${question.text}`);
            }
            quizQuestions.push(createdQuestion);
            const quizResponses: any[] = [];
            for (const response of question.responses) {
                const createdResponse = await prisma.quizResponse.create({
                    data: {
                        questionId: createdQuestion.id,
                        text: response.text,
                        isCorrect: response.isCorrect,
                        index: response.index,
                    },
                });
                if (!createdResponse) {
                    throw new Error(`Failed to create response: ${response.text}`);
                }
                quizResponses.push(createdResponse);
            }
        }
        quizRecords.push(quizRecord);
    }

    return await prisma.job.findUnique({
        where: {id: job2.id},
        include: {
            competencies: true,
            competenciesFamilies: true,
            quizzes: {
                include: {
                    questions: {
                        include: {
                            responses: true
                        }
                    },
                }
            },
        }
    });
}

// Usage example
(async () => {
    try {
        const {job, quizzes} = await loadJobWithQuizzes("./data_center/Jobs/ProductManager.json");
        const fullDbJob = await persistJobAndQuizzesToDatabase(job, quizzes);
        console.log("Job title:", job.jobTitle);
        console.log("Loaded", quizzes.length, "quizzes.");
        for (const q of quizzes) {
            console.log("Quiz:", q.title, "| Level:", q.level);
        }
    } catch (err) {
        console.error("Error loading data:", err);
    }
})();

