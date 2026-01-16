import {NextFunction, Request, Response} from "express";
import * as jobService from "../services/user_jobs.services";
import {sendResponse} from "../utils/helpers";
import {generateMarkdownArticleForLastQuiz} from "../services/generateMarkdownArticleForLastQuiz";
import {detectLanguage} from "../middlewares/i18n";

// 👉 Optionnel : validation simple de format
const LOCAL_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/;

export const retrieveCurrentUserJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        if (!userId) {
            return sendResponse(res, 401, {error: 'Utilisateur non authentifié.'});
        }

        const lang = await detectLanguage(req);
        const userJob = await jobService.getCurrentUserJob(userId, lang);
        if (!userJob) {
            return sendResponse(res, 200, {data: null});
            // return sendResponse(res, 404, {error: 'Aucun job utilisateur actuel trouvé.'});
        }

        return sendResponse(res, 200, {data: userJob});
    } catch (err) {
        console.error('retrieveCurrentUserJob error:', err);
        return sendResponse(res, 500, {
            error: "Une erreur s'est produite lors de la récupération du job utilisateur actuel.",
            message: err instanceof Error ? err.message : 'Unknown error'
        });
    }
}

export const setCurrentUserJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        const jobId = req.params.jobId;

        if (!jobId) {
            return sendResponse(res, 400, {error: 'L’identifiant du job est requis.'});
        }
        if (!userId) {
            return sendResponse(res, 401, {error: 'Utilisateur non authentifié.'});
        }

        const lang = await detectLanguage(req);
        const userJob = await jobService.setCurrentUserJob(userId, jobId, lang);
        if (!userJob) {
            return sendResponse(res, 404, {error: 'Job utilisateur non trouvé.'});
        }

        return sendResponse(res, 200, {data: userJob});
    } catch (err) {
        console.error('setCurrentUserJob error:', err);
        return sendResponse(res, 500, {
            error: "Une erreur s'est produite lors de la mise à jour du job utilisateur courant.",
            message: err instanceof Error ? err.message : 'Unknown error'
        });
    }
}

export const setCurrentUserJobFamily = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        const jobFamilyId = req.params.jobFamilyId;

        if (!jobFamilyId) {
            return sendResponse(res, 400, {error: 'L’identifiant de la famille de métiers est requis.'});
        }
        if (!userId) {
            return sendResponse(res, 401, {error: 'Utilisateur non authentifié.'});
        }

        const lang = await detectLanguage(req);
        const userJob = await jobService.setCurrentUserJobFamily(userId, jobFamilyId, lang);
        if (!userJob) {
            return sendResponse(res, 404, {error: 'Track utilisateur non trouvé.'});
        }

        return sendResponse(res, 200, {data: userJob});
    } catch (err) {
        console.error('setCurrentUserJobFamily error:', err);
        return sendResponse(res, 500, {
            error: "Une erreur s'est produite lors de la mise à jour du track famille.",
            message: err instanceof Error ? err.message : 'Unknown error'
        });
    }
}

export const updateUserJobFamilySelection = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userJobId = req.params.userJobId;
        const selectedJobIds = req.body?.selectedJobIds;

        if (!userJobId) {
            return sendResponse(res, 400, {error: 'L’identifiant du track est requis.'});
        }
        if (!Array.isArray(selectedJobIds)) {
            return sendResponse(res, 400, {error: 'selectedJobIds doit être un tableau.'});
        }

        const selections = await jobService.updateUserJobFamilySelection(userJobId, selectedJobIds);

        return sendResponse(res, 200, {data: selections});
    } catch (err) {
        console.error('updateUserJobFamilySelection error:', err);
        return sendResponse(res, 500, {
            error: "Une erreur s'est produite lors de la mise à jour de la sélection des métiers.",
            message: err instanceof Error ? err.message : 'Unknown error'
        });
    }
}

export const getJobLeaderboard = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {jobId} = req.params;

        if (!jobId) {
            return res.status(400).json({error: 'jobId is required'});
        }

        // Période optionnelle via query params
        // Période optionnelle via query params (toujours des strings ou string[])
        const fromParam = typeof req.query.from === 'string' ? req.query.from : undefined;
        const toParam = typeof req.query.to === 'string' ? req.query.to : undefined;

        if (fromParam && !LOCAL_DATETIME_REGEX.test(fromParam)) {
            return res.status(400).json({error: "Format de 'from' invalide. Attendu: YYYY-MM-DD ou YYYY-MM-DDTHH:mm"});
        }

        if (toParam && !LOCAL_DATETIME_REGEX.test(toParam)) {
            return res.status(400).json({error: "Format de 'to' invalide. Attendu: YYYY-MM-DD ou YYYY-MM-DDTHH:mm"});
        }

        const ranking = await jobService.getRankingForJob({
            jobId,
            from: fromParam,
            to: toParam,
            lang: await detectLanguage(req),
        });

        return sendResponse(res, 200, {
            data: {
                jobId,
                from: fromParam ?? null,
                to: toParam ?? null,
                count: ranking.length,
                results: ranking,
            }
        });


        // return res.json({
        //     jobId,
        //     from: fromDate ?? null,
        //     to: toDate ?? null,
        //     count: ranking.length,
        //     results: ranking,
        // });
    } catch (error) {
        console.error('Error fetching leaderboard', error);
        // return res.status(500).json({error: 'Internal server error'});
        return sendResponse(res, 500, {
            error: "Une erreur s'est produite lors de la récupération du classement.",
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}


// retrieveDailyQuizForJob
export const retrieveDailyQuizForJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        const jobId = req.params.jobId;
        if (!jobId) {
            return sendResponse(res, 400, {error: 'L’identifiant du job ou de la famille est requis.'});
        }
        if (!userId) {
            return sendResponse(res, 401, {error: 'Utilisateur non authentifié.'});
        }

        const quiz = await jobService.retrieveDailyQuizForJob(jobId, userId, await detectLanguage(req));
        if (!quiz) {
            return sendResponse(res, 404, {error: 'Quiz quotidien non trouvé pour ce job ou cette famille.'});
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
        const doneAt : any = typeof req.body.doneAt === 'string' ? req.body.doneAt : undefined;
        const timezone = typeof req.body.timezone === 'string' ? req.body.timezone : undefined;

        if (doneAt && !LOCAL_DATETIME_REGEX.test(doneAt)) {
            return res.status(400).json({error: "Format de 'from' invalide. Attendu: YYYY-MM-DD ou YYYY-MM-DDTHH:mm"});
        }


        if (!jobId || !quizId) {
            return sendResponse(res, 400, {error: 'jobId et quizId sont requis.'});
        }
        if (!userId) {
            return sendResponse(res, 401, {error: 'Utilisateur non authentifié.'});
        }
        if (!answers || !Array.isArray(answers)) {
            return sendResponse(res, 400, {error: 'Les réponses du quiz sont requises et doivent être un tableau.'});
        }

        const result = await jobService.saveUserQuizAnswers(
            jobId,
            quizId,
            userId,
            answers,
            doneAt,
            timezone,
            await detectLanguage(req),
        );
        return sendResponse(res, 200, {data: result});
    } catch (err) {
        console.error('saveDailyQuizAnswers error:', err);
        return sendResponse(res, 500, {
            error: "Une erreur s'est produite lors de l'enregistrement des réponses du quiz.",
            message: err instanceof Error ? err.message : 'Unknown error'
        });
    }
};

export const listLearningResourcesForUserJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        const userJobId = req.params.userJobId;

        if (!userJobId) {
            return sendResponse(res, 400, {error: 'L’identifiant du job utilisateur est requis.'});
        }
        if (!userId) {
            return sendResponse(res, 401, {error: 'Utilisateur non authentifié.'});
        }

        const resources = await jobService.listLearningResourcesForUserJob(userJobId, userId, await detectLanguage(req));
        return sendResponse(res, 200, {data: resources});
    } catch (err) {
        console.error('listLearningResourcesForUserJob error:', err);
        return sendResponse(res, 500, {
            error: "Une erreur s'est produite lors de la récupération des ressources d'apprentissage.",
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

        const userJob = await jobService.getUserJob(jobId, userId, await detectLanguage(req));
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


export const getUserJobCompetencyProfileHandler = async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.userId;
    const userJobId = req.params.userJobId as string; // ou query/body

    try {
        const profile = await jobService.getUserJobCompetencyProfile(userId, userJobId, await detectLanguage(req));
        sendResponse(res, 200, {data: profile});
    } catch (e: any) {
        console.error(e);
        sendResponse(res, 500, {
            error: "Une erreur s'est produite lors de la récupération du profil de compétences du job utilisateur.",
            message: e instanceof Error ? e.message : 'Unknown error'
        });
    }
};

// generateMarkdownArticleForLastQuiz
export const generateMarkdownArticleForLastQuiz2 = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        const userJobId = req.params.userJobId;

        if (!userJobId) {
            return sendResponse(res, 400, {error: 'L’identifiant du job utilisateur est requis.'});
        }
        if (!userId) {
            return sendResponse(res, 401, {error: 'Utilisateur non authentifié.'});
        }

        const article = await generateMarkdownArticleForLastQuiz(userJobId, userId);
        return sendResponse(res, 200, {data: article});
    } catch (err) {
        console.error('generateMarkdownArticleForLastQuiz error:', err);
        return sendResponse(res, 500, {
            error: "Une erreur s'est produite lors de la génération de l'article Markdown pour le dernier quiz.",
            message: err instanceof Error ? err.message : 'Unknown error'
        });
    }
};
