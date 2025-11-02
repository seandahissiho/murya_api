import {prisma} from "../config/db";

export const searchJobs = async (query: string) => {
    return prisma.job.findMany({
        orderBy: {title: 'asc'},
        where: {
            OR: [
                {title: {contains: query, mode: 'insensitive'}},
                {normalizedName: {contains: query, mode: 'insensitive'}},
                {description: {contains: query, mode: 'insensitive'}},
                {jobFamily: {name: {contains: query, mode: 'insensitive'}}},
            ],
        },
        // limit to 50 results
        take: 100,
    });
}

export const getJobDetails = async (jobId: string) => {
    return prisma.job.findUnique({
        where: {id: jobId},
        include: {
            jobFamily: true,
            competenciesFamilies: {
                include: {
                    competencies: true,
                    parent: true,
                    children: true
                }
            },
            competencies: {
                include: {
                    families: {
                        include: {
                            competencies: true,
                            parent: true,
                            children: true
                        }
                    },
                }
            }
        }
    });
}

export const getCompetencyFamilyDetailsForJob = async (jobId: string, cfId: string) => {
    const job = await prisma.job.findUnique({
        where: {id: jobId},
    });

    if (!job) {
        throw new Error("Job not found");
    }

    const family = await prisma.competenciesFamily.findUnique({
        where: {id: cfId, parent: null},
    });

    if (!family) {
        throw new Error("Competency Family not found");
    }

    const competencies = await prisma.competency.findMany({
        where: {
            jobs: {
                some: { id: jobId }
            },
            families: {
                some: { id: cfId }
            }
        }
    });

    return {
        job,
        family,
        competencies
    };
}
