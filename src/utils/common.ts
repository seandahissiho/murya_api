// Middleware to check validation results
import {validationResult} from "express-validator";
import {NextFunction, Request, Response} from "express";
import jwt from "jsonwebtoken";
import {prisma} from "../config/db";
import {permissions_action, permissions_entity} from "@prisma/client";
import {sendResponse} from "./helpers";


export const authenticateToken = async (
        req: Request,
        res: Response,
        next: NextFunction,
    ) => {
        const token = req.header("Authorization")?.split(" ")[1];

        if (!token) {
            return sendResponse(res, 401, {
                error: "Veuillez vous connecter pour accéder à cette ressource",
            });
        }

        try {
            (req as any).user = jwt.verify(token, process.env.JWT_SECRET as string);

            // Check if the user exists in the database
            const userId = (req as any).user.userId;
            const userRoleId = (req as any).user.userRole;

            if (!userId || !userRoleId) {
                return sendResponse(res, 401, {
                    error: "Veuillez vous connecter pour accéder à cette ressource",
                });
            }

            const user = await prisma.user.findUnique({
                where: {id: userId},
                include: {
                    role: {
                        include: {
                            permissions: {
                                select: {entity: true, action: true},
                            },
                        },
                    },
                },
            });

            if (!user) {
                return sendResponse(res, 401, {
                    error: "Utilisateur non trouvé ou accès refusé",
                });
            }

            if (!user.isActive) {
                return sendResponse(res, 403, {
                    error: "Votre compte est désactivé. Veuillez contacter l'administrateur.",
                });
            }

            if (!user.role) {
                return sendResponse(res, 403, {
                    error: "Votre rôle n'est pas défini. Veuillez contacter l'administrateur.",
                });
            }

            //  || user.role.permissions.length === 0
            if (!user.role.permissions) {
                return sendResponse(res, 403, {
                    error: "Vous n'avez pas les permissions nécessaires pour accéder à cette ressource",
                });
            }

            next();
        } catch
            (error) {
            return sendResponse(res, 401, {
                error: "Veuillez vous connecter pour accéder à cette ressource",
            });
        }
    }
;

export const checkPermissions = (
    allowedPermissions: {
        entities: permissions_entity[];
        actions: permissions_action[];
    }[],
) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const userId = (req as any)?.user?.userId;

        if (!userId)
            return sendResponse(res, 401, {
                error: "Veuillez vous connecter pour accéder à cette ressource",
            });

        try {
            const user = await prisma.user.findUnique({
                where: {id: userId},
                include: {
                    role: {
                        include: {
                            permissions: {
                                select: {entity: true, action: true},
                            },
                        },
                    },
                },
            });

            if (!user)
                return sendResponse(res, 404, {
                    error: "L'utilisateur n'a pas été retrouvé",
                });
            if (user.isAdmin) return next();

            const userPermissions = user.role!.permissions.reduce(
                (acc, {entity, action}) => {
                    let entityObj = acc.find((e) => e.entity === entity);
                    if (!entityObj) {
                        entityObj = {entity, actions: []};
                        acc.push(entityObj);
                    }
                    if (!entityObj.actions.includes(action)) {
                        entityObj.actions.push(action);
                    }
                    return acc;
                },
                [] as { entity: permissions_entity; actions: permissions_action[] }[],
            );

            const checkEntitiesUserPermissions = allowedPermissions.every(
                ({entities, actions}) => {
                    const foundEntity = userPermissions.find(
                        (item: any) => entities.includes(item.entity),
                    );
                    return (
                        foundEntity &&
                        foundEntity.actions.length >= actions.length &&
                        actions.every((action) => foundEntity.actions.includes(action))
                    );
                },
            );

            if (!checkEntitiesUserPermissions) {
                // log the route that was accessed
                console.log("Unauthorized access to route: ", req.originalUrl);
                return sendResponse(res, 403, {
                    error:
                        "Vous n'avez pas les permissions nécessaires pour accéder à cette ressource",
                });
            }

            next();
        } catch (error) {
            console.log(error);
            return sendResponse(res, 500, {
                error: "Une erreur est survenue",
            });
        }
    };
};

const checkValidationResult = (req: Request, res: Response, next: NextFunction) => {
    const result = validationResult(req);
    if (!result.isEmpty()) {
        return res.status(400).json({errors: result.array()});
    }
    next();
};

export default checkValidationResult;
