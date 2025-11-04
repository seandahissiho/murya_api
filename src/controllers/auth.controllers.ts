import {Request, Response, NextFunction} from 'express';
import type {RegisterDto, LoginDto} from '../dtos/auth.dtos';
import * as authService from '../services/auth.services';
import {sendResponse} from "../utils/helpers";

// POST /auth/register
export const register = async (req: Request<any, any, RegisterDto>, res: Response, next: NextFunction) => {
    try {
        const dto = req.body;
        const user = await authService.register(
            dto.email,
            dto.password,
            dto.firstname,
            dto.lastname,
            dto.phone,
            dto.birthDate
        );

        sendResponse(
            res,
            201,
            {
                message: "Utilisateur enregistré avec succès",
                data: {id: user.id}
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
        const {email, password} = req.body;
        const {access_token, refresh_token} = await authService.login(email, password);

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

        const {access_token, user} = await authService.refresh(refresh_token);

        return sendResponse(
            res,
            200,
            {
                message: "Jetons rafraîchis avec succès",
                data: {access_token, refresh_token, user}
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