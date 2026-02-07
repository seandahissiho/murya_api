import {prisma} from '../config/db';
import {trackEvent} from './quests.services';
import {getTranslationsMap} from '../i18n/translate';

const resolveTranslationValue = (
    translations: Map<string, string>,
    entityId: string,
    field: string,
    fallback: string | null | undefined,
) => {
    const value = translations.get(`${entityId}::${field}`);
    if (value !== undefined) {
        return value;
    }
    return fallback ?? null;
};

const resolveUserJobAccess = async (
    resource: {userJobId: string | null; jobId: string | null; jobFamilyId: string | null},
    userId: string,
): Promise<string | null> => {
    if (resource.userJobId) {
        const userJob = await prisma.userJob.findFirst({
            where: {id: resource.userJobId, userId},
            select: {id: true},
        });
        if (!userJob) {
            throw new Error('Accès refusé.');
        }
        return userJob.id;
    }

    if (resource.jobId || resource.jobFamilyId) {
        const userJob = await prisma.userJob.findFirst({
            where: {
                userId,
                OR: [
                    ...(resource.jobId ? [{jobId: resource.jobId}] : []),
                    ...(resource.jobFamilyId ? [{jobFamilyId: resource.jobFamilyId}] : []),
                ],
            },
            select: {id: true},
        });
        if (!userJob) {
            throw new Error('Accès refusé.');
        }
        return userJob.id;
    }

    return null;
};

const attachTranslations = async (
    resource: any,
    lang: string | undefined,
) => {
    if (!lang) {
        return resource;
    }
    const translations = await getTranslationsMap({
        entity: 'LearningResource',
        entityIds: [resource.id],
        fields: ['title', 'description', 'content'],
        lang,
    });
    return {
        ...resource,
        title: resolveTranslationValue(translations, resource.id, 'title', resource.title),
        description: resolveTranslationValue(translations, resource.id, 'description', resource.description),
        content: resolveTranslationValue(translations, resource.id, 'content', resource.content),
    };
};

export const collectResource = async (
    resourceId: string,
    userId: string,
    timezone?: string,
    lang: string = 'en',
) => {
    const resource = await prisma.learningResource.findUnique({
        where: {id: resourceId},
    });

    if (!resource) {
        throw new Error('Ressource introuvable.');
    }

    if (!resource.userJobId) {
        throw new Error('Ressource non collectable.');
    }

    const userJob = await prisma.userJob.findFirst({
        where: {id: resource.userJobId, userId},
        select: {id: true},
    });

    if (!userJob) {
        throw new Error('Accès refusé.');
    }

    if (resource.collectedAt) {
        return resource;
    }

    const updated = await prisma.learningResource.update({
        where: {id: resource.id},
        data: {collectedAt: new Date()},
    });

    await trackEvent(userJob.id, 'RESOURCE_COLLECTED', {resourceId}, timezone, userId);

    if (!lang) {
        return updated;
    }

    const translations = await getTranslationsMap({
        entity: 'LearningResource',
        entityIds: [updated.id],
        fields: ['title', 'description', 'content'],
        lang,
    });

    return {
        ...updated,
        title: resolveTranslationValue(translations, updated.id, 'title', updated.title),
        description: resolveTranslationValue(translations, updated.id, 'description', updated.description),
        content: resolveTranslationValue(translations, updated.id, 'content', updated.content),
    };
};

export const openResource = async (
    resourceId: string,
    userId: string,
    timezone?: string,
    lang: string = 'en',
) => {
    const resource = await prisma.learningResource.findUnique({
        where: {id: resourceId},
    });

    if (!resource) {
        throw new Error('Ressource introuvable.');
    }

    const userJobId = await resolveUserJobAccess(
        {userJobId: resource.userJobId, jobId: resource.jobId, jobFamilyId: resource.jobFamilyId},
        userId,
    );

    const now = new Date();
    const upserted = await prisma.userLearningResource.upsert({
        where: {userId_resourceId: {userId, resourceId}},
        create: {
            userId,
            resourceId,
            openedAt: now,
            lastViewedAt: now,
            viewsCount: 1,
        },
        update: {
            lastViewedAt: now,
            viewsCount: {increment: 1},
        },
    });

    const userState = upserted.openedAt
        ? upserted
        : await prisma.userLearningResource.update({
            where: {id: upserted.id},
            data: {openedAt: now},
        });

    await trackEvent(userJobId, 'RESOURCE_OPENED', {resourceId}, timezone, userId);

    const localized = await attachTranslations(resource, lang);

    return {
        resource: localized,
        userState,
    };
};

export const markResourceRead = async (
    resourceId: string,
    userId: string,
    timezone?: string,
    lang: string = 'en',
    progress?: number,
) => {
    const resource = await prisma.learningResource.findUnique({
        where: {id: resourceId},
    });

    if (!resource) {
        throw new Error('Ressource introuvable.');
    }

    const userJobId = await resolveUserJobAccess(
        {userJobId: resource.userJobId, jobId: resource.jobId, jobFamilyId: resource.jobFamilyId},
        userId,
    );

    const now = new Date();
    const updateData: Record<string, unknown> = {
        lastViewedAt: now,
        viewsCount: {increment: 1},
    };
    if (progress !== undefined) {
        updateData.progress = progress;
    }

    const upserted = await prisma.userLearningResource.upsert({
        where: {userId_resourceId: {userId, resourceId}},
        create: {
            userId,
            resourceId,
            openedAt: now,
            readAt: now,
            lastViewedAt: now,
            viewsCount: 1,
            ...(progress !== undefined ? {progress} : {}),
        },
        update: updateData,
    });

    let userState = upserted;
    if (!userState.readAt || !userState.openedAt) {
        userState = await prisma.userLearningResource.update({
            where: {id: upserted.id},
            data: {
                readAt: userState.readAt ?? now,
                openedAt: userState.openedAt ?? now,
            },
        });
    }

    await trackEvent(userJobId, 'RESOURCE_READ', {resourceId}, timezone, userId);

    const localized = await attachTranslations(resource, lang);

    return {
        resource: localized,
        userState,
    };
};

export const likeResource = async (
    resourceId: string,
    userId: string,
    timezone?: string,
    lang: string = 'en',
    like: boolean,
) => {
    const resource = await prisma.learningResource.findUnique({
        where: {id: resourceId},
    });

    if (!resource) {
        throw new Error('Ressource introuvable.');
    }

    const userJobId = await resolveUserJobAccess(
        {userJobId: resource.userJobId, jobId: resource.jobId, jobFamilyId: resource.jobFamilyId},
        userId,
    );

    const now = new Date();
    const likedAt = like ? now : null;
    const upserted = await prisma.userLearningResource.upsert({
        where: {userId_resourceId: {userId, resourceId}},
        create: {
            userId,
            resourceId,
            isLikedAt: likedAt,
        },
        update: {
            isLikedAt: likedAt,
        },
    });

    if (like) {
        await trackEvent(userJobId, 'RESOURCE_LIKED', {resourceId}, timezone, userId);
    } else {
        await trackEvent(userJobId, 'RESOURCE_UNLIKED', {resourceId}, timezone, userId);
    }

    const localized = await attachTranslations(resource, lang);

    return {
        resource: localized,
        userState: upserted,
    };
};
