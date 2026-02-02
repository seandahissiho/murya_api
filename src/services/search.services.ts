import {Prisma} from '@prisma/client';
import {prisma} from '../config/db';
import {getTranslationsMap} from "../i18n/translate";
import {buildLearningResourceAccessWhere} from './learning_resources.access';

export type SearchSectionKey = 'jobs' | 'jobFamilies' | 'learningResources' | 'users';

export type SearchItem = {
    type: 'job' | 'jobFamily' | 'learningResource' | 'user';
    id: string;
    title: string;
    subtitle?: string | null;
    image_url?: string | null;
    icon?: string | null;
    highlights?: string[];
    score?: number;
    createdAt: Date;
};

export type SearchSectionResult = {
    items: SearchItem[];
    next_cursor: string | null;
    total: number | null;
};

type SearchResult = {
    items: SearchItem[];
    total: number | null;
};

export type GlobalSearchResponse = {
    query: string;
    took_ms: number;
    sections: Record<SearchSectionKey, SearchSectionResult>;
    errors: Record<SearchSectionKey, string | null>;
};

export type GlobalSearchOptions = {
    userId: string;
    query: string;
    limit: number;
    includeTotal: boolean;
    sections: Set<SearchSectionKey>;
    timeoutMs: number;
    lang?: string;
};

const DEFAULT_SECTIONS: SearchSectionKey[] = ['jobs', 'jobFamilies', 'learningResources', 'users'];

const withTimeout = async <T>(task: () => Promise<T>, timeoutMs: number): Promise<T> => {
    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error('Search timeout'));
        }, timeoutMs);
    });

    try {
        return await Promise.race([task(), timeoutPromise]);
    } finally {
        clearTimeout(timeoutId!);
    }
};

const buildUserAccessWhere = async (userId: string): Promise<Prisma.UserWhereInput> => {
    const companyMemberships = await prisma.companyUser.findMany({
        where: {userId},
        select: {companyId: true},
    });

    if (!companyMemberships.length) {
        return {};
    }

    const companyIds = companyMemberships.map((membership) => membership.companyId);
    return {
        companies: {
            some: {
                companyId: {in: companyIds},
            },
        },
    };
};

const searchJobs = async (
    query: string,
    limit: number,
    includeTotal: boolean,
    lang?: string,
): Promise<SearchResult> => {
    const where: Prisma.JobWhereInput = {
        isActive: true,
        OR: [
            {title: {contains: query, mode: 'insensitive'}},
            {slug: {contains: query, mode: 'insensitive'}},
            {description: {contains: query, mode: 'insensitive'}},
            {jobFamily: {name: {contains: query, mode: 'insensitive'}}},
        ],
    };

    const [rows, total] = await Promise.all([
        prisma.job.findMany({
            where,
            orderBy: {createdAt: 'desc'},
            take: limit,
            select: {
                id: true,
                title: true,
                createdAt: true,
                jobFamily: {select: {id: true, name: true}},
            },
        }),
        includeTotal ? prisma.job.count({where}) : Promise.resolve(null),
    ]);

    const jobIds = rows.map((job) => job.id);
    const jobFamilyIds = rows
        .map((job) => job.jobFamily?.id)
        .filter((id): id is string => Boolean(id));

    const [jobTranslations, jobFamilyTranslations] = await Promise.all([
        lang && jobIds.length
            ? getTranslationsMap({
                entity: 'Job',
                entityIds: jobIds,
                fields: ['title'],
                lang,
            })
            : new Map<string, string>(),
        lang && jobFamilyIds.length
            ? getTranslationsMap({
                entity: 'JobFamily',
                entityIds: jobFamilyIds,
                fields: ['name'],
                lang,
            })
            : new Map<string, string>(),
    ]);

    const items: SearchItem[] = rows.map((job): SearchItem => ({
        type: 'job',
        id: job.id,
        title: jobTranslations.get(`${job.id}::title`) ?? job.title,
        subtitle: job.jobFamily
            ? jobFamilyTranslations.get(`${job.jobFamily.id}::name`) ?? job.jobFamily.name
            : null,
        image_url: null,
        createdAt: job.createdAt,
    }));

    return {items, total};
};

const searchJobFamilies = async (
    query: string,
    limit: number,
    includeTotal: boolean,
    lang?: string,
): Promise<SearchResult> => {
    const where: Prisma.JobFamilyWhereInput = {
        OR: [
            {name: {contains: query, mode: 'insensitive'}},
            {description: {contains: query, mode: 'insensitive'}},
            {slug: {contains: query, mode: 'insensitive'}},
        ],
    };

    const [rows, total] = await Promise.all([
        prisma.jobFamily.findMany({
            where,
            orderBy: {name: 'asc'},
            take: limit,
            select: {
                id: true,
                name: true,
                description: true,
                createdAt: true,
            },
        }),
        includeTotal ? prisma.jobFamily.count({where}) : Promise.resolve(null),
    ]);

    const familyIds = rows.map((family) => family.id);
    const familyTranslations = lang && familyIds.length
        ? await getTranslationsMap({
            entity: 'JobFamily',
            entityIds: familyIds,
            fields: ['name', 'description'],
            lang,
        })
        : new Map<string, string>();

    const items: SearchItem[] = rows.map((family): SearchItem => ({
        type: 'jobFamily',
        id: family.id,
        title: familyTranslations.get(`${family.id}::name`) ?? family.name,
        subtitle: familyTranslations.get(`${family.id}::description`) ?? family.description ?? null,
        image_url: null,
        createdAt: family.createdAt,
    }));

    return {items, total};
};

const searchLearningResources = async (
    query: string,
    limit: number,
    includeTotal: boolean,
    userId: string,
    lang?: string,
): Promise<SearchResult> => {
    const accessWhere = await buildLearningResourceAccessWhere(userId);
    const where: Prisma.LearningResourceWhereInput = {
        AND: [
            accessWhere,
            {
                OR: [
                    {title: {contains: query, mode: 'insensitive'}},
                    {description: {contains: query, mode: 'insensitive'}},
                    {content: {contains: query, mode: 'insensitive'}},
                ],
            },
        ],
    };

    const [rows, total] = await Promise.all([
        prisma.learningResource.findMany({
            where,
            orderBy: {updatedAt: 'desc'},
            take: limit,
            select: {
                id: true,
                title: true,
                type: true,
                source: true,
                thumbnailUrl: true,
                createdAt: true,
            },
        }),
        includeTotal ? prisma.learningResource.count({where}) : Promise.resolve(null),
    ]);

    const resourceIds = rows.map((resource) => resource.id);
    const resourceTranslations = lang && resourceIds.length
        ? await getTranslationsMap({
            entity: 'LearningResource',
            entityIds: resourceIds,
            fields: ['title'],
            lang,
        })
        : new Map<string, string>();

    const items: SearchItem[] = rows.map((resource): SearchItem => ({
        type: 'learningResource',
        id: resource.id,
        title: resourceTranslations.get(`${resource.id}::title`) ?? resource.title,
        subtitle: resource.type.toLowerCase(),
        image_url: resource.thumbnailUrl ?? null,
        createdAt: resource.createdAt,
    }));

    return {items, total};
};

const searchUsers = async (
    query: string,
    limit: number,
    includeTotal: boolean,
    userId: string,
): Promise<SearchResult> => {
    const accessWhere = await buildUserAccessWhere(userId);
    const where: Prisma.UserWhereInput = {
        isActive: true,
        AND: [
            accessWhere,
            {
                OR: [
                    {firstname: {contains: query, mode: 'insensitive'}},
                    {lastname: {contains: query, mode: 'insensitive'}},
                    {email: {contains: query, mode: 'insensitive'}},
                    {phone: {contains: query, mode: 'insensitive'}},
                    {role: {name: {contains: query, mode: 'insensitive'}}},
                ],
            },
        ],
    };

    const [rows, total] = await Promise.all([
        prisma.user.findMany({
            where,
            orderBy: {updatedAt: 'desc'},
            take: limit,
        select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
            avatarUrl: true,
            createdAt: true,
            role: {select: {name: true}},
        },
        }),
        includeTotal ? prisma.user.count({where}) : Promise.resolve(null),
    ]);

    const items: SearchItem[] = rows.map((user): SearchItem => {
        const fullName = [user.firstname, user.lastname].filter(Boolean).join(' ');
        const title = fullName || user.email || 'Utilisateur';
        return {
            type: 'user',
            id: user.id,
            title,
            subtitle: user.role?.name ?? null,
            image_url: user.avatarUrl ?? null,
            createdAt: user.createdAt,
        };
    });

    return {items, total};
};

export const globalSearch = async (options: GlobalSearchOptions): Promise<GlobalSearchResponse> => {
    const start = Date.now();

    const sections: Record<SearchSectionKey, SearchSectionResult> = {
        jobs: {items: [], next_cursor: null, total: null},
        jobFamilies: {items: [], next_cursor: null, total: null},
        learningResources: {items: [], next_cursor: null, total: null},
        users: {items: [], next_cursor: null, total: null},
    };

    const errors: Record<SearchSectionKey, string | null> = {
        jobs: null,
        jobFamilies: null,
        learningResources: null,
        users: null,
    };

    const tasks: Array<{
        section: SearchSectionKey;
        promise: Promise<{items: SearchItem[]; total: number | null}>;
    }> = [];

    if (options.sections.has('jobs')) {
        tasks.push({
            section: 'jobs',
            promise: withTimeout(
                () => searchJobs(options.query, options.limit, options.includeTotal, options.lang),
                options.timeoutMs,
            ),
        });
    }

    if (options.sections.has('jobFamilies')) {
        tasks.push({
            section: 'jobFamilies',
            promise: withTimeout(
                () => searchJobFamilies(options.query, options.limit, options.includeTotal, options.lang),
                options.timeoutMs,
            ),
        });
    }

    if (options.sections.has('learningResources')) {
        tasks.push({
            section: 'learningResources',
            promise: withTimeout(
                () => searchLearningResources(
                    options.query,
                    options.limit,
                    options.includeTotal,
                    options.userId,
                    options.lang,
                ),
                options.timeoutMs,
            ),
        });
    }

    if (options.sections.has('users')) {
        tasks.push({
            section: 'users',
            promise: withTimeout(
                () => searchUsers(options.query, options.limit, options.includeTotal, options.userId),
                options.timeoutMs,
            ),
        });
    }

    const settled = await Promise.allSettled(tasks.map((task) => task.promise));

    settled.forEach((entry, index) => {
        const section = tasks[index].section;
        if (entry.status === 'fulfilled') {
            const result = entry.value;
            sections[section] = {
                items: result.items,
                next_cursor: null,
                total: result.total ?? null,
            };
        } else {
            const message = entry.reason instanceof Error ? entry.reason.message : 'Unknown error';
            errors[section] = message;
        }
    });

    const took_ms = Date.now() - start;

    return {
        query: options.query,
        took_ms,
        sections,
        errors,
    };
};

export const getDefaultSections = () => new Set<SearchSectionKey>(DEFAULT_SECTIONS);
