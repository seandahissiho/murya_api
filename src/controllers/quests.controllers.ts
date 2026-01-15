import {NextFunction, Request, Response} from 'express';
import {sendResponse} from '../utils/helpers';
import * as questService from '../services/quests.services';

export const listQuests = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        if (!userId) {
            return sendResponse(res, 401, {error: 'Utilisateur non authentifié.'});
        }

        const timezone = typeof req.query.timezone === 'string'
            ? req.query.timezone
            : undefined;
        const userJobId = typeof req.query.userJobId === 'string'
            ? req.query.userJobId
            : undefined;

        const quests = await questService.listUserQuests(userId, timezone, userJobId);
        return sendResponse(res, 200, {data: quests});
    } catch (err) {
        console.error('listQuests error:', err);
        return sendResponse(res, 500, {
            error: "Une erreur s'est produite lors de la récupération des quêtes.",
            message: err instanceof Error ? err.message : 'Unknown error',
        });
    }
};

export const claimQuestReward = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        const questId = req.params.id;
        const timezone = typeof req.body?.timezone === 'string'
            ? req.body.timezone
            : undefined;

        if (!questId) {
            return sendResponse(res, 400, {error: 'L’identifiant de la quête est requis.'});
        }
        if (!userId) {
            return sendResponse(res, 401, {error: 'Utilisateur non authentifié.'});
        }

        const result = await questService.claimUserJobQuest(userId, questId, timezone);
        return sendResponse(res, 200, {data: result});
    } catch (err) {
        console.error('claimQuestReward error:', err);
        return sendResponse(res, 400, {
            error: "Impossible de réclamer la récompense.",
            message: err instanceof Error ? err.message : 'Unknown error',
        });
    }
};
