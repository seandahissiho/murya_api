import {NextFunction, Request, Response} from "express";
import * as jobService from "../services/user_jobs.services";
import {sendResponse} from "../utils/helpers";
import {detectLanguage} from "../middlewares/i18n";

// retrieveDailyQuizForJob
export const retrieveDailyQuizForJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        const jobId = req.params.jobId;
        if (!jobId) {
            return sendResponse(res, 400, {error: 'L’identifiant du job est requis.'});
        }
        if (!userId) {
            return sendResponse(res, 401, {error: 'Utilisateur non authentifié.'});
        }

        const quiz = await jobService.retrieveDailyQuizForJob(jobId, userId);
        if (!quiz) {
            return sendResponse(res, 404, {error: 'Quiz quotidien non trouvé pour ce job.'});
        }

        return sendResponse(res, 200, {data: quiz});
    } catch (err) {
        console.error('retrieveDailyQuizForJob error:', err);
        return sendResponse(res, 500, {
            error: "Une erreur s'est produite lors de la récupération du quiz quotidien.",
            message: err instanceof Error ? err.message : 'Unknown error'
        });
    }
}

// saveDailyQuizAnswers
export const saveDailyQuizAnswers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        const jobId = req.params.jobId;
        const quizId = req.params.quizId;
        const answers = req.body.answers;

        if (!jobId || !quizId) {
            return sendResponse(res, 400, {error: 'jobId et quizId sont requis.'});
        }
        if (!userId) {
            return sendResponse(res, 401, {error: 'Utilisateur non authentifié.'});
        }
        if (!answers || !Array.isArray(answers)) {
            return sendResponse(res, 400, {error: 'Les réponses du quiz sont requises et doivent être un tableau.'});
        }

        const result = await jobService.saveUserQuizAnswers(jobId, quizId, userId, answers);
        return sendResponse(res, 200, {data: result});
    } catch (err) {
        console.error('saveDailyQuizAnswers error:', err);
        return sendResponse(res, 500, {
            error: "Une erreur s'est produite lors de l'enregistrement des réponses du quiz.",
            message: err instanceof Error ? err.message : 'Unknown error'
        });
    }
};

// getUserJob
export const getUserJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        const jobId = req.params.jobId;

        if (!jobId) {
            return sendResponse(res, 400, {error: 'L’identifiant du job est requis.'});
        }
        if (!userId) {
            return sendResponse(res, 401, {error: 'Utilisateur non authentifié.'});
        }

        const userJob = await jobService.getUserJob(jobId, userId);
        if (!userJob) {
            return sendResponse(res, 404, {error: 'Job utilisateur non trouvé.'});
        }

        return sendResponse(res, 200, {data: userJob});
    } catch (err) {
        console.error('getUserJob error:', err);
        return sendResponse(res, 500, {
            error: "Une erreur s'est produite lors de la récupération du job utilisateur.",
            message: err instanceof Error ? err.message : 'Unknown error'
        });
    }
};