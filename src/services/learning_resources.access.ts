import {LearningResourceSource, Prisma} from '@prisma/client';
import {prisma} from '../config/db';

export async function buildLearningResourceAccessWhere(
    userId: string,
): Promise<Prisma.LearningResourceWhereInput> {
    const userJobs = await prisma.userJob.findMany({
        where: {userId},
        select: {id: true, jobId: true, jobFamilyId: true},
    });

    if (!userJobs.length) {
        return {id: {in: []}};
    }

    const userJobIds = userJobs.map((job) => job.id);
    const jobIds = Array.from(new Set(userJobs.map((job) => job.jobId).filter(Boolean))) as string[];
    const jobFamilyIds = Array.from(new Set(userJobs.map((job) => job.jobFamilyId).filter(Boolean))) as string[];

    const orFilters: Prisma.LearningResourceWhereInput[] = [];

    if (userJobIds.length) {
        orFilters.push({userJobId: {in: userJobIds}});
    }

    if (jobIds.length) {
        orFilters.push({
            jobId: {in: jobIds},
            source: LearningResourceSource.SYSTEM_DEFAULT,
        });
    }

    if (jobFamilyIds.length) {
        orFilters.push({
            jobFamilyId: {in: jobFamilyIds},
            source: LearningResourceSource.SYSTEM_DEFAULT,
        });
    }

    if (!orFilters.length) {
        return {id: {in: []}};
    }

    return {OR: orFilters};
}
