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
