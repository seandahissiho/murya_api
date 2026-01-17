import {NextFunction, Request, Response} from 'express';
import {getSingleParam, sendResponse} from '../utils/helpers';
import * as resourceService from '../services/resources.services';

export const collectResource = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        const resourceId = getSingleParam(req.params.id);
        const timezone = typeof req.body.timezone === 'string'
            ? req.body.timezone
            : undefined;

        if (!resourceId) {
            return sendResponse(res, 400, {error: 'L’identifiant de la ressource est requis.'});
        }
        if (!userId) {
            return sendResponse(res, 401, {error: 'Utilisateur non authentifié.'});
        }

        const resource = await resourceService.collectResource(resourceId, userId, timezone);
        return sendResponse(res, 200, {data: resource});
    } catch (err) {
        console.error('collectResource error:', err);
        return sendResponse(res, 400, {
            error: "Impossible de collecter la ressource.",
            message: err instanceof Error ? err.message : 'Unknown error',
        });
    }
};
