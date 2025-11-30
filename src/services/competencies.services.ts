import {SearchOptions} from "./jobs.services";
import {resolveFields} from "../i18n/translate";
import {prisma} from "../config/db";

export const searchCompetencies = async (
    query: string,
    {page = 1, perPage = 20, lang = 'en'}: SearchOptions = {},
) => {
    const skip = (page - 1) * perPage;
    const where: any = {
        OR: [
            {name: {contains: query, mode: 'insensitive'}},
            {slug: {contains: query, mode: 'insensitive'}},
        ],
    };

    const [total, competencies] = await Promise.all([
        prisma.competency.count({where}),
        prisma.competency.findMany({
            where,
            skip,
            take: perPage,
            orderBy: {name: 'asc'},
        }),
    ]);

    const localizedCompetencies = await Promise.all(
        competencies.map(async (competency: any) => {
            const localizedCompetency = await resolveFields({
                entity: 'Competency',
                entityId: competency.id,
                fields: ['name', 'description'],
                lang,
                base: competency,
            });
            return localizedCompetency;
        }),
    );

    return {
        total,
        page,
        perPage,
        competencies: localizedCompetencies,
    }
};

export const getCompetenciesFamiliesAndSubFamilies = async (lang: string = 'en') => {
    const families = await prisma.competenciesFamily.findMany({
        // where children is not empty
        where: {
            children: {
                some: {},
            }
        },
        select: {
            name: true,
            slug: true,
            children: {
                select: {
                    name: true,
                    slug: true,
                    competencies: {
                        select: {
                            name: true,
                            slug: true,
                            description: true,
                        },
                        orderBy: {name: 'asc'},
                    },
                },
                orderBy: {name: 'asc'},
            },
        },
        orderBy: {name: 'asc'},
    });

    const localizedFamilies = await Promise.all(
        families.map(async (family: any) => {
            const localizedFamily = await resolveFields({
                entity: 'CompetenciesFamily',
                entityId: family.id,
                fields: ['name', 'description'],
                lang,
                base: family,
            });

            localizedFamily.children = await Promise.all(
                family.children.map(async (subFamily: any) => {
                    const localizedSubFamily = await resolveFields({
                        entity: 'CompetenciesSubFamily',
                        entityId: subFamily.id,
                        fields: ['name', 'description'],
                        lang,
                        base: subFamily,
                    });
                    return localizedSubFamily;
                }),
            );

            return localizedFamily;
        }),
    );

    return localizedFamilies;
};

export const getCompetenciesFamilies = async (lang: string = 'en') => {
    return [];
};