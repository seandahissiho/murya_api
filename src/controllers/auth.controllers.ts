import {NextFunction, Request, Response} from 'express';
import type {LoginDto, RegisterDto} from '../dtos/auth.dtos';
import * as authService from '../services/auth.services';
import {sendResponse} from "../utils/helpers";

// POST /auth/register
export const register = async (req: Request<any, any, RegisterDto>, res: Response, next: NextFunction) => {
    try {
        const dto = req.body;

        const hasDeviceOnly = !!dto.deviceId && !dto.password;
        const hasCredentials = (!!dto.email || !!dto.phone) && !!dto.password;

        if (!hasDeviceOnly && !hasCredentials) {
            return sendResponse(res, 400, {
                error: "Fournissez soit un deviceId, soit email/phone + mot de passe pour l'inscription.",
            });
        }

        await authService.register(
            dto.email,
            dto.phone,
            dto.deviceId,
            dto.password,
        );

        const {access_token, refresh_token} = await authService.login(dto.email, dto.phone, dto.deviceId, dto.password);

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
                error: "Une erreur s'est produite lors de l'enregistrement de l'utilisateur.",
                message: err instanceof Error ? err.message : 'Unknown error'
            }
        );
    }
};

// POST /auth/login
export const login = async (req: Request<any, any, LoginDto>, res: Response, next: NextFunction) => {
    try {
        const {email, password, phone, deviceId} = req.body;

        const hasDeviceOnly = !!deviceId && !password;
        const hasCredentials = (!!email || !!phone) && !!password;

        if (!hasDeviceOnly && !hasCredentials) {
            return sendResponse(res, 400, {
                error: "Fournissez soit un deviceId, soit email/phone + mot de passe pour la connexion.",
            });
        }

        const {access_token, refresh_token} = await authService.login(email, phone, deviceId, password);

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
                error: "Identifiants invalides. Veuillez vérifier votre email et mot de passe.",
            }
        );
    }
};

// GET /auth/me
export const retrieve = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user.userId;

        const user = await authService.retrieve(userId);

        return sendResponse(
            res,
            200,
            {
                message: "Informations de l'utilisateur récupérées avec succès",
                data: user
            },
        );
    } catch (err) {
        return sendResponse(
            res,
            500,
            {
                error: "Une erreur s'est produite lors de la récupération des informations de l'utilisateur.",
            }
        );
    }
};

    // POST /auth/refresh
export const refresh = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {refresh_token} = req.body;

        if (!refresh_token) {
            return sendResponse(res, 400, {
                error: "Veuillez fournir un token de rafraîchissement",
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
                error: "Échec du rafraîchissement des jetons. Veuillez vous reconnecter.",
            }
        );
    }
};
