import {prisma} from '../config/db';
import {trackEvent} from './quests.services';

export const collectResource = async (
    resourceId: string,
    userId: string,
    timezone?: string,
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

    return updated;
};
