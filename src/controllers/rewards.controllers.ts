import {NextFunction, Request, Response} from "express";
import {RewardKind} from "@prisma/client";
import * as rewardsService from "../services/rewards.services";
import {getSingleParam, sendResponse} from "../utils/helpers";
import {ServiceError} from "../utils/serviceError";
import {detectLanguage} from "../middlewares/i18n";
import {MURYA_ERROR} from "../constants/errorCodes";

const handleError = (res: Response, err: unknown, fallback: string) => {
    if (err instanceof ServiceError) {
        return sendResponse(res, err.status, {code: err.code ?? MURYA_ERROR.INTERNAL_ERROR});
    }
    console.error(fallback, err);
    return sendResponse(res, 500, {
        code: MURYA_ERROR.INTERNAL_ERROR,
    });
};

export const listRewards = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        if (!userId) {
            return sendResponse(res, 401, {code: MURYA_ERROR.AUTH_REQUIRED});
        }

        const city = typeof req.query.city === "string" ? req.query.city : undefined;
        const kindParam = typeof req.query.kind === "string" ? req.query.kind : undefined;
        const kind = kindParam && (Object.values(RewardKind) as string[]).includes(kindParam)
            ? (kindParam as RewardKind)
            : undefined;
        const onlyAvailable = req.query.onlyAvailable === "true" || req.query.onlyAvailable === "1";
        const page = Number.parseInt((req.query.page as string) || "1", 10);
        const limit = Number.parseInt((req.query.limit as string) || "20", 10);
        const lang = await detectLanguage(req);

        const result = await rewardsService.listRewards(userId, {
            city,
            kind,
            onlyAvailable,
            page,
            limit,
            lang,
        });
        return sendResponse(res, 200, result);
    } catch (err) {
        return handleError(res, err, "listRewards error:");
    }
};

export const getRewardDetails = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        const rewardId = getSingleParam(req.params.id);
        if (!rewardId) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        if (!userId) {
            return sendResponse(res, 401, {code: MURYA_ERROR.AUTH_REQUIRED});
        }

        const lang = await detectLanguage(req);
        const result = await rewardsService.getRewardDetails(userId, rewardId, lang);
        return sendResponse(res, 200, result);
    } catch (err) {
        return handleError(res, err, "getRewardDetails error:");
    }
};

export const purchaseReward = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        const rewardId = getSingleParam(req.params.id);
        if (!rewardId) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        if (!userId) {
            return sendResponse(res, 401, {code: MURYA_ERROR.AUTH_REQUIRED});
        }

        const idempotencyKey = req.get("Idempotency-Key") || req.get("idempotency-key");
        const quantity = Number.isInteger(req.body?.quantity)
            ? Number(req.body.quantity)
            : 1;
        if (!Number.isInteger(quantity) || quantity <= 0) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }

        const lang = await detectLanguage(req);
        const result = await rewardsService.purchaseReward(
            userId,
            rewardId,
            quantity,
            idempotencyKey ?? "",
            lang,
        );
        const status = result.idempotent ? 200 : 201;
        return sendResponse(res, status, {
            purchase: result.purchase,
            wallet: result.wallet,
        });
    } catch (err) {
        return handleError(res, err, "purchaseReward error:");
    }
};

export const listUserPurchases = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        if (!userId) {
            return sendResponse(res, 401, {code: MURYA_ERROR.AUTH_REQUIRED});
        }

        const page = Number.parseInt((req.query.page as string) || "1", 10);
        const limit = Number.parseInt((req.query.limit as string) || "20", 10);
        const lang = await detectLanguage(req);
        const result = await rewardsService.listUserPurchases(userId, {page, limit, lang});
        return sendResponse(res, 200, result);
    } catch (err) {
        return handleError(res, err, "listUserPurchases error:");
    }
};

export const getUserPurchaseDetails = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        const purchaseId = getSingleParam(req.params.id);
        if (!purchaseId) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        if (!userId) {
            return sendResponse(res, 401, {code: MURYA_ERROR.AUTH_REQUIRED});
        }

        const lang = await detectLanguage(req);
        const result = await rewardsService.getUserPurchaseDetails(userId, purchaseId, lang);
        return sendResponse(res, 200, result);
    } catch (err) {
        return handleError(res, err, "getUserPurchaseDetails error:");
    }
};

export const getWallet = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        if (!userId) {
            return sendResponse(res, 401, {code: MURYA_ERROR.AUTH_REQUIRED});
        }

        const limit = Number.parseInt((req.query.limit as string) || "20", 10);
        const result = await rewardsService.getWallet(userId, limit);
        return sendResponse(res, 200, result);
    } catch (err) {
        return handleError(res, err, "getWallet error:");
    }
};
