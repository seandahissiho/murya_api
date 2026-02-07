import {NextFunction, Request, Response} from 'express';
import {getSingleParam, sendResponse} from '../utils/helpers';
import * as resourceService from '../services/resources.services';
import {detectLanguage} from "../middlewares/i18n";
import {MURYA_ERROR} from "../constants/errorCodes";

export const collectResource = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        const resourceId = getSingleParam(req.params.id);
        const timezone = typeof req.body.timezone === 'string'
            ? req.body.timezone
            : undefined;

        if (!resourceId) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        if (!userId) {
            return sendResponse(res, 401, {code: MURYA_ERROR.AUTH_REQUIRED});
        }

        const lang = await detectLanguage(req);
        const resource = await resourceService.collectResource(resourceId, userId, timezone, lang);
        return sendResponse(res, 200, {data: resource});
    } catch (err) {
        console.error('collectResource error:', err);
        return sendResponse(res, 400, {
            code: MURYA_ERROR.INVALID_REQUEST,
        });
    }
};

export const openResource = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        const resourceId = getSingleParam(req.params.id);
        const timezone = typeof req.body.timezone === 'string'
            ? req.body.timezone
            : undefined;

        if (!resourceId) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        if (!userId) {
            return sendResponse(res, 401, {code: MURYA_ERROR.AUTH_REQUIRED});
        }

        const lang = await detectLanguage(req);
        const data = await resourceService.openResource(resourceId, userId, timezone, lang);
        return sendResponse(res, 200, {data});
    } catch (err) {
        console.error('openResource error:', err);
        return sendResponse(res, 400, {
            code: MURYA_ERROR.INVALID_REQUEST,
        });
    }
};

export const readResource = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        const resourceId = getSingleParam(req.params.id);
        const timezone = typeof req.body.timezone === 'string'
            ? req.body.timezone
            : undefined;
        const progress = typeof req.body.progress === 'number'
            ? req.body.progress
            : undefined;

        if (!resourceId) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        if (!userId) {
            return sendResponse(res, 401, {code: MURYA_ERROR.AUTH_REQUIRED});
        }

        const lang = await detectLanguage(req);
        const data = await resourceService.markResourceRead(resourceId, userId, timezone, lang, progress);
        return sendResponse(res, 200, {data});
    } catch (err) {
        console.error('readResource error:', err);
        return sendResponse(res, 400, {
            code: MURYA_ERROR.INVALID_REQUEST,
        });
    }
};

export const likeResource = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        const resourceId = getSingleParam(req.params.id);
        const timezone = typeof req.body.timezone === 'string'
            ? req.body.timezone
            : undefined;
        const like = typeof req.body.like === 'boolean'
            ? req.body.like
            : undefined;

        if (!resourceId) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        if (!userId) {
            return sendResponse(res, 401, {code: MURYA_ERROR.AUTH_REQUIRED});
        }
        if (like === undefined) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }

        const lang = await detectLanguage(req);
        const data = await resourceService.likeResource(resourceId, userId, timezone, lang, like);
        return sendResponse(res, 200, {data});
    } catch (err) {
        console.error('likeResource error:', err);
        return sendResponse(res, 400, {
            code: MURYA_ERROR.INVALID_REQUEST,
        });
    }
};
