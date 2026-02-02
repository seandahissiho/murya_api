import {NextFunction, Request, Response} from "express";
import * as rewardsService from "../services/rewards.services";
import * as addressService from "../services/address.services";
import {getSingleParam, sendResponse} from "../utils/helpers";
import {ServiceError} from "../utils/serviceError";
import {MURYA_ERROR} from "../constants/errorCodes";
import {detectLanguage} from "../middlewares/i18n";

const handleError = (res: Response, err: unknown, fallback: string) => {
    if (err instanceof ServiceError) {
        return sendResponse(res, err.status, {code: err.code ?? MURYA_ERROR.INTERNAL_ERROR});
    }
    console.error(fallback, err);
    return sendResponse(res, 500, {
        code: MURYA_ERROR.INTERNAL_ERROR,
    });
};

export const createReward = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const lang = await detectLanguage(req);
        const result = await rewardsService.createReward(req.body, lang);
        return sendResponse(res, 201, {data: result});
    } catch (err) {
        return handleError(res, err, "createReward error:");
    }
};

export const updateReward = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rewardId = getSingleParam(req.params.id);
        if (!rewardId) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        const lang = await detectLanguage(req);
        const result = await rewardsService.updateReward(rewardId, req.body, lang);
        return sendResponse(res, 200, {data: result});
    } catch (err) {
        return handleError(res, err, "updateReward error:");
    }
};

export const adjustRewardStock = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rewardId = getSingleParam(req.params.id);
        const delta = req.body?.delta;
        if (!rewardId) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        if (!Number.isInteger(delta)) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        const lang = await detectLanguage(req);
        const result = await rewardsService.adjustRewardStock(rewardId, delta, lang);
        return sendResponse(res, 200, {data: result});
    } catch (err) {
        return handleError(res, err, "adjustRewardStock error:");
    }
};

export const createAddress = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await detectLanguage(req);
        const result = await addressService.createAddress(req.body);
        return sendResponse(res, 201, {data: result});
    } catch (err) {
        return handleError(res, err, "createAddress error:");
    }
};

export const markPurchaseReady = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const purchaseId = getSingleParam(req.params.id);
        if (!purchaseId) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        const lang = await detectLanguage(req);
        const result = await rewardsService.markPurchaseReady(purchaseId, {
            voucherCode: req.body?.voucherCode ?? null,
            voucherLink: req.body?.voucherLink ?? null,
        }, lang);
        return sendResponse(res, 200, {data: result});
    } catch (err) {
        return handleError(res, err, "markPurchaseReady error:");
    }
};

export const refundPurchase = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const purchaseId = getSingleParam(req.params.id);
        if (!purchaseId) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        await detectLanguage(req);
        const result = await rewardsService.refundPurchase(purchaseId);
        return sendResponse(res, 200, result);
    } catch (err) {
        return handleError(res, err, "refundPurchase error:");
    }
};
