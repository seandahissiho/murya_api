import {NextFunction, Request, Response} from 'express';
import {StreakType} from '@prisma/client';
import type {LoginDto, RegisterDto, UpdateMeDto} from '../dtos/auth.dtos';
import * as authService from '../services/auth.services';
import {sendResponse} from "../utils/helpers";
import {MURYA_ERROR} from "../constants/errorCodes";
import {detectLanguage} from "../middlewares/i18n";
import {prisma} from "../config/db";

type UpdateLanguageDto = {
    lang?: string | null;
    preferredLangCode?: string | null;
    languageCode?: string | null;
};

// POST /auth/register
export const register = async (req: Request<any, any, RegisterDto>, res: Response, next: NextFunction) => {
    try {
        await detectLanguage(req);
        const dto = req.body;

        const hasDeviceOnly = !!dto.deviceId && !dto.password;
        const hasCredentials = (!!dto.email || !!dto.phone) && !!dto.password;

        if (!hasDeviceOnly && !hasCredentials) {
            return sendResponse(res, 400, {
                code: MURYA_ERROR.INVALID_REQUEST,
            });
        }

        await authService.register(
            dto.email,
            dto.phone,
            dto.deviceId,
            dto.password,
        );

        const {access_token, refresh_token} = await authService.login(
            dto.email,
            dto.phone,
            dto.deviceId,
            dto.password,
            dto.timezone,
        );

        sendResponse(
            res,
            201,
            {
                message: "Utilisateur enregistré avec succès",
                data: {access_token, refresh_token}
            }
        );
    } catch (err) {
        sendResponse(
            res,
            500,
            {
                code: MURYA_ERROR.INTERNAL_ERROR,
            }
        );
    }
};

// POST /auth/login
export const login = async (req: Request<any, any, LoginDto>, res: Response, next: NextFunction) => {
    try {
        await detectLanguage(req);
        const {email, password, phone, deviceId, timezone} = req.body;

        const hasDeviceOnly = !!deviceId && !password;
        const hasCredentials = (!!email || !!phone) && !!password;

        if (!hasDeviceOnly && !hasCredentials) {
            return sendResponse(res, 400, {
                code: MURYA_ERROR.INVALID_REQUEST,
            });
        }

        const {access_token, refresh_token} = await authService.login(
            email,
            phone,
            deviceId,
            password,
            timezone,
        );

        return sendResponse(
            res,
            200,
            {
                message: "Connexion réussie",
                data: {access_token, refresh_token}
            }
        )
    } catch (err) {
        return sendResponse(
            res,
            401,
            {
                code: MURYA_ERROR.AUTH_INVALID_CREDENTIALS,
            }
        );
    }
};

// GET /auth/me
export const retrieve = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await detectLanguage(req);
        const userId = (req as any).user.userId;

        const user = await authService.retrieve(userId);
        const loginStreak = (user as any)?.userStreaks?.find(
            (streak: any) => streak.type === StreakType.LOGIN_DAILY,
        );
        const streakDays = loginStreak?.currentDays ?? 0;

        return sendResponse(
            res,
            200,
            {
                message: "Informations de l'utilisateur récupérées avec succès",
                data: {
                    ...user,
                    streakDays,
                }
            },
        );
    } catch (err) {
        return sendResponse(
            res,
            500,
            {
                code: MURYA_ERROR.INTERNAL_ERROR,
            }
        );
    }
};

// PUT /auth/me
export const update = async (req: Request<any, any, UpdateMeDto>, res: Response, next: NextFunction) => {
    try {
        await detectLanguage(req);
        const userId = (req as any).user.userId;
        const dto = req.body;

        const user = await authService.updateMe(userId, dto);

        return sendResponse(
            res,
            200,
            {
                message: "Informations de l'utilisateur mises à jour avec succès",
                data: user
            },
        );
    } catch (err: any) {
        if (err?.code === "P2002") {
            return sendResponse(
                res,
                409,
                {
                    code: MURYA_ERROR.CONFLICT,
                },
            );
        }
        if (err?.code === "P2025") {
            return sendResponse(
                res,
                404,
                {
                    code: MURYA_ERROR.USER_NOT_FOUND,
                },
            );
        }
        return sendResponse(
            res,
            500,
            {
                code: MURYA_ERROR.INTERNAL_ERROR,
            }
        );
    }
};

// PUT /auth/me/language
export const updateLanguage = async (req: Request<any, any, UpdateLanguageDto>, res: Response, next: NextFunction) => {
    try {
        await detectLanguage(req);
        const userId = (req as any).user?.userId;

        if (!userId) {
            return sendResponse(res, 401, {code: MURYA_ERROR.AUTH_REQUIRED});
        }

        const rawLang = req.body?.lang ?? req.body?.preferredLangCode ?? req.body?.languageCode;
        if (rawLang === undefined) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }

        if (rawLang === null) {
            const user = await authService.updateMe(userId, {preferredLangCode: null});
            return sendResponse(res, 200, {
                message: "Langue utilisateur mise à jour avec succès",
                data: {preferredLangCode: user.preferredLangCode},
            });
        }

        if (typeof rawLang !== 'string') {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }

        const trimmed = rawLang.trim();
        if (!trimmed) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }

        const baseLang = trimmed.split('-')[0]?.toLowerCase();
        if (!baseLang) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }

        const language = await prisma.language.findUnique({
            where: {code: baseLang},
            select: {code: true},
        });

        if (!language) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }

        const user = await authService.updateMe(userId, {preferredLangCode: language.code});
        return sendResponse(res, 200, {
            message: "Langue utilisateur mise à jour avec succès",
            data: {preferredLangCode: user.preferredLangCode},
        });
    } catch (err) {
        return sendResponse(res, 500, {
            code: MURYA_ERROR.INTERNAL_ERROR,
        });
    }
};

    // POST /auth/refresh
export const refresh = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await detectLanguage(req);
        const {refresh_token} = req.body;

        if (!refresh_token) {
            return sendResponse(res, 400, {
                code: MURYA_ERROR.AUTH_REFRESH_TOKEN_REQUIRED,
            });
        }

        const {access_token, refresh_token: rotated_refresh_token, user} = await authService.refresh(refresh_token);

        return sendResponse(
            res,
            200,
            {
                message: "Jetons rafraîchis avec succès",
                data: {access_token, refresh_token: rotated_refresh_token, user}
            }
        );
    } catch (err) {
        return sendResponse(
            res,
            401,
            {
                code: MURYA_ERROR.AUTH_REFRESH_FAILED,
            }
        );
    }
};
