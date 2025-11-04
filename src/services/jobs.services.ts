import { PrismaClient } from '@prisma/client';
import { resolveFields } from '../i18n/translate';

const prisma = new PrismaClient();

/**
 * Recherche de jobs avec support multilingue (lang = 'fr' ou 'en').
 */
interface SearchOptions {
    page?: number;
    perPage?: number;
    lang?: string;
}

/**
 * Recherche de jobs avec pagination + multilingue
 */
export const searchJobs = async (
    query: string,
    { page = 1, perPage = 20, lang = 'en' }: SearchOptions = {},
) => {
    const skip = (page - 1) * perPage;

    const where = {
        OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { normalizedName: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            {
                jobFamily: {
                    name: { contains: query, mode: 'insensitive' },
                },
            },
        ],
    };

    const [jobs, total] = await Promise.all([
        prisma.job.findMany({
            where,
            orderBy: { title: 'asc' },
            include: { jobFamily: true },
            skip,
            take: perPage,
        }),
        prisma.job.count({ where }),
    ]);

    const localizedJobs = await Promise.all(
        jobs.map(async (job) => {
            const localizedJob = await resolveFields({
                entity: 'Job',
                entityId: job.id,
                fields: ['title', 'description'],
                lang,
                base: job,
            });

            const localizedJobFamily = job.jobFamily
                ? await resolveFields({
                    entity: 'JobFamily',
                    entityId: job.jobFamily.id,
                    fields: ['name'],
                    lang,
                    base: job.jobFamily,
                })
                : null;

            return { ...localizedJob, jobFamily: localizedJobFamily };
        }),
    );

    return {
        items: localizedJobs,
        pagination: {
            page,
            perPage,
            total,
            totalPages: Math.ceil(total / perPage),
        },
    };
};
/**
 * Récupère les détails d’un job, avec ses familles de compétences et compétences,
 * tout en appliquant les traductions selon la langue demandée.
 */
export const getJobDetails = async (jobId: string, lang: string = 'en') => {
    const job = await prisma.job.findUnique({
        where: { id: jobId },
        include: {
            jobFamily: true,
            competenciesFamilies: {
                include: {
                    competencies: true,
                    parent: true,
                    children: true,
                },
            },
            competencies: {
                include: {
                    families: {
                        include: {
                            competencies: true,
                            parent: true,
                            children: true,
                        },
                    },
                },
            },
        },
    });

    if (!job) return null;

    // Localiser le job
    const localizedJob = await resolveFields({
        entity: 'Job',
        entityId: job.id,
        fields: ['title', 'description'],
        lang,
        base: job,
    });

    // Localiser la JobFamily
    const localizedJobFamily = job.jobFamily
        ? await resolveFields({
            entity: 'JobFamily',
            entityId: job.jobFamily.id,
            fields: ['name'],
            lang,
            base: job.jobFamily,
        })
        : null;

    // Localiser les familles de compétences
    const localizedFamilies = await Promise.all(
        job.competenciesFamilies.map(async (fam) => {
            const locFam = await resolveFields({
                entity: 'CompetenciesFamily',
                entityId: fam.id,
                fields: ['name', 'description'],
                lang,
                base: fam,
            });

            return {
                ...locFam,
                parent: fam.parent,
                children: fam.children,
                competencies: fam.competencies,
            };
        }),
    );

    // Localiser les compétences
    const localizedCompetencies = await Promise.all(
        job.competencies.map(async (comp) => {
            const locComp = await resolveFields({
                entity: 'Competency',
                entityId: comp.id,
                fields: ['name'],
                lang,
                base: comp,
            });
            return locComp;
        }),
    );

    return {
        ...localizedJob,
        jobFamily: localizedJobFamily,
        competenciesFamilies: localizedFamilies,
        competencies: localizedCompetencies,
    };
};

/**
 * Récupère les détails d’une famille de compétences liée à un job.
 */
export const getCompetencyFamilyDetailsForJob = async (
    jobId: string,
    cfId: string,
    lang: string = 'en',
) => {
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new Error('Job not found');

    const family = await prisma.competenciesFamily.findUnique({
        where: { id: cfId },
    });
    if (!family) throw new Error('Competency Family not found');

    const competencies = await prisma.competency.findMany({
        where: {
            jobs: { some: { id: jobId } },
            families: { some: { id: cfId } },
        },
    });

    const localizedJob = await resolveFields({
        entity: 'Job',
        entityId: job.id,
        fields: ['title', 'description'],
        lang,
        base: job,
    });

    const localizedFamily = await resolveFields({
        entity: 'CompetenciesFamily',
        entityId: family.id,
        fields: ['name', 'description'],
        lang,
        base: family,
    });

    const localizedCompetencies = await Promise.all(
        competencies.map((comp) =>
            resolveFields({
                entity: 'Competency',
                entityId: comp.id,
                fields: ['name'],
                lang,
                base: comp,
            }),
        ),
    );

    return {
        job: localizedJob,
        family: localizedFamily,
        competencies: localizedCompetencies,
    };
};
