import {NextFunction, Request, Response} from "express";
import * as moduleService from "../services/modules.services";
import {sendResponse} from "../utils/helpers";
import {ServiceError} from "../utils/serviceError";
import {detectLanguage} from "../middlewares/i18n";

const handleError = (res: Response, err: unknown, fallback: string) => {
    if (err instanceof ServiceError) {
        return sendResponse(res, err.status, {error: err.message});
    }
    console.error(fallback, err);
    return sendResponse(res, 500, {
        error: "Une erreur s'est produite.",
        message: err instanceof Error ? err.message : "Unknown error",
    });
};

export const listModules = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const includeParam = typeof req.query.include === "string" ? req.query.include : undefined;
        if (includeParam && includeParam !== "basic" && includeParam !== "full") {
            return sendResponse(res, 400, {error: "Paramètre \"include\" invalide."});
        }

        const limitParam = typeof req.query.limit === "string" ? req.query.limit : undefined;
        const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
        if (limitParam && limit && (!Number.isFinite(limit) || limit <= 0)) {
            return sendResponse(res, 400, {error: "Paramètre \"limit\" invalide."});
        }

        const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
        const lang = await detectLanguage(req);

        const result = await moduleService.listModules({
            include: includeParam as "basic" | "full" | undefined,
            limit,
            cursor,
            lang,
        });
        return sendResponse(res, 200, result);
    } catch (err) {
        return handleError(res, err, "listModules error:");
    }
};

export const listUserModules = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.params.userId;
        if (!userId) {
            return sendResponse(res, 400, {error: "L'identifiant utilisateur est requis."});
        }

        await moduleService.ensureUserExists(userId);
        const data = await moduleService.listUserModules(userId);
        return sendResponse(res, 200, {data});
    } catch (err) {
        return handleError(res, err, "listUserModules error:");
    }
};

export const listUserLandingModules = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.params.userId;
        if (!userId || typeof userId !== "string") {
            return sendResponse(res, 400, {error: "L'identifiant utilisateur est requis."});
        }

        await moduleService.ensureUserExists(userId);
        const data = await moduleService.listUserLandingModules(userId);
        return sendResponse(res, 200, {data});
    } catch (err) {
        return handleError(res, err, "listUserLandingModules error:");
    }
};

export const addUserLandingModule = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.params.userId;
        const moduleId = req.body?.moduleId;
        const order = req.body?.order;

        if (!userId) {
            return sendResponse(res, 400, {error: "L'identifiant utilisateur est requis."});
        }
        if (!moduleId || typeof moduleId !== "string") {
            return sendResponse(res, 400, {error: "Le champ \"moduleId\" est requis."});
        }
        if (!Number.isInteger(order)) {
            return sendResponse(res, 400, {error: "Le champ \"order\" est requis et doit être un entier."});
        }

        await moduleService.ensureUserExists(userId);
        const result = await moduleService.addUserLandingModule(userId, moduleId, order);
        return sendResponse(res, 200, result);
    } catch (err) {
        return handleError(res, err, "addUserLandingModule error:");
    }
};

export const removeUserLandingModule = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.params.userId;
        const moduleId = req.params.moduleId;

        if (!userId || !moduleId) {
            return sendResponse(res, 400, {error: "userId et moduleId sont requis."});
        }

        await moduleService.ensureUserExists(userId);
        const result = await moduleService.removeUserLandingModule(userId, moduleId);
        return sendResponse(res, 200, result);
    } catch (err) {
        return handleError(res, err, "removeUserLandingModule error:");
    }
};

export const reorderUserLandingModules = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.params.userId;
        const orders = req.body?.orders;

        if (!userId) {
            return sendResponse(res, 400, {error: "L'identifiant utilisateur est requis."});
        }
        if (!Array.isArray(orders)) {
            return sendResponse(res, 400, {error: "Le champ \"orders\" est requis."});
        }

        const normalized = orders.map((item: any) => ({
            moduleId: item?.moduleId,
            order: item?.order,
        }));

        if (
            normalized.some(
                (item) => typeof item.moduleId !== "string" || !Number.isInteger(item.order),
            )
        ) {
            return sendResponse(res, 400, {error: "Chaque entrée doit contenir moduleId et order."});
        }

        const moduleIdSet = new Set(normalized.map((item) => item.moduleId));
        if (moduleIdSet.size !== normalized.length) {
            return sendResponse(res, 400, {error: "Les moduleId doivent être uniques."});
        }

        await moduleService.ensureUserExists(userId);
        const result = await moduleService.reorderUserLandingModules(userId, normalized);
        return sendResponse(res, 200, result);
    } catch (err) {
        return handleError(res, err, "reorderUserLandingModules error:");
    }
};

export const listUserLandingModulesAudit = async (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    try {
        const userId = req.params.userId;
        if (!userId) {
            return sendResponse(res, 400, {error: "L'identifiant utilisateur est requis."});
        }

        const sinceParam = typeof req.query.since === "string" ? req.query.since : undefined;
        const sinceDate = sinceParam ? new Date(sinceParam) : undefined;
        if (sinceParam && (!sinceDate || Number.isNaN(sinceDate.getTime()))) {
            return sendResponse(res, 400, {error: "Paramètre \"since\" invalide."});
        }

        await moduleService.ensureUserExists(userId);
        const events = await moduleService.listUserLandingModuleEvents(userId, sinceDate);
        return sendResponse(res, 200, {events});
    } catch (err) {
        return handleError(res, err, "listUserLandingModulesAudit error:");
    }
};
