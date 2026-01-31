import {NextFunction, Request, Response} from "express";
import * as jobService from "../services/user_jobs.services";
import {getSingleParam, sendResponse} from "../utils/helpers";
import {generateMarkdownArticleForLastQuiz} from "../services/generateMarkdownArticleForLastQuiz";
import {detectLanguage} from "../middlewares/i18n";
import {MURYA_ERROR} from "../constants/errorCodes";

// 👉 Optionnel : validation simple de format
const LOCAL_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/;

export const retrieveCurrentUserJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        if (!userId) {
            return sendResponse(res, 401, {code: MURYA_ERROR.AUTH_REQUIRED});
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
            code: MURYA_ERROR.INTERNAL_ERROR,
        });
    }
}

export const setCurrentUserJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        const jobId = getSingleParam(req.params.jobId);

        if (!jobId) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        if (!userId) {
            return sendResponse(res, 401, {code: MURYA_ERROR.AUTH_REQUIRED});
        }

        const lang = await detectLanguage(req);
        const userJob = await jobService.setCurrentUserJob(userId, jobId, lang);
        if (!userJob) {
            return sendResponse(res, 404, {code: MURYA_ERROR.NOT_FOUND});
        }

        return sendResponse(res, 200, {data: userJob});
    } catch (err) {
        console.error('setCurrentUserJob error:', err);
        return sendResponse(res, 500, {
            code: MURYA_ERROR.INTERNAL_ERROR,
        });
    }
}

export const setCurrentUserJobFamily = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        const jobFamilyId = getSingleParam(req.params.jobFamilyId);

        if (!jobFamilyId) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        if (!userId) {
            return sendResponse(res, 401, {code: MURYA_ERROR.AUTH_REQUIRED});
        }

        const lang = await detectLanguage(req);
        const userJob = await jobService.setCurrentUserJobFamily(userId, jobFamilyId, lang);
        if (!userJob) {
            return sendResponse(res, 404, {code: MURYA_ERROR.NOT_FOUND});
        }

        return sendResponse(res, 200, {data: userJob});
    } catch (err) {
        console.error('setCurrentUserJobFamily error:', err);
        return sendResponse(res, 500, {
            code: MURYA_ERROR.INTERNAL_ERROR,
        });
    }
}

export const updateUserJobFamilySelection = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userJobId = getSingleParam(req.params.userJobId);
        const selectedJobIds = req.body?.selectedJobIds;

        if (!userJobId) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        if (!Array.isArray(selectedJobIds)) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }

        const selections = await jobService.updateUserJobFamilySelection(userJobId, selectedJobIds);

        return sendResponse(res, 200, {data: selections});
    } catch (err) {
        console.error('updateUserJobFamilySelection error:', err);
        return sendResponse(res, 500, {
            code: MURYA_ERROR.INTERNAL_ERROR,
        });
    }
}

export const getJobLeaderboard = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const jobId = getSingleParam(req.params.jobId);

        if (!jobId) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }

        // Période optionnelle via query params
        // Période optionnelle via query params (toujours des strings ou string[])
        const fromParam = typeof req.query.from === 'string' ? req.query.from : undefined;
        const toParam = typeof req.query.to === 'string' ? req.query.to : undefined;

        if (fromParam && !LOCAL_DATETIME_REGEX.test(fromParam)) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }

        if (toParam && !LOCAL_DATETIME_REGEX.test(toParam)) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
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
        return sendResponse(res, 500, {
            code: MURYA_ERROR.INTERNAL_ERROR,
        });
    }
}

export const getCompetencyFamilyDetailsForUserJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        const userJobId = getSingleParam(req.params.userJobId);
        const cfId = getSingleParam(req.params.cfId);

        if (!userId) {
            return sendResponse(res, 401, {code: MURYA_ERROR.AUTH_REQUIRED});
        }
        if (!userJobId || !cfId) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }

        const details = await jobService.getCompetencyFamilyDetailsForUserJob(
            userId,
            userJobId,
            cfId,
            await detectLanguage(req),
        );

        return sendResponse(res, 200, {data: details});
    } catch (err) {
        console.error('getCompetencyFamilyDetailsForUserJob error:', err);
        return sendResponse(res, 500, {
            code: MURYA_ERROR.INTERNAL_ERROR,
        });
    }
}


// retrieveDailyQuizForJob
export const retrieveDailyQuizForJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        const jobId = getSingleParam(req.params.jobId);
        if (!jobId) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        if (!userId) {
            return sendResponse(res, 401, {code: MURYA_ERROR.AUTH_REQUIRED});
        }

        const quiz = await jobService.retrieveDailyQuizForJob(jobId, userId, await detectLanguage(req));
        if (!quiz) {
            return sendResponse(res, 404, {code: MURYA_ERROR.NOT_FOUND});
        }

        return sendResponse(res, 200, {data: quiz});
    } catch (err) {
        console.error('retrieveDailyQuizForJob error:', err);
        return sendResponse(res, 500, {
            code: MURYA_ERROR.INTERNAL_ERROR,
        });
    }
}

// saveDailyQuizAnswers
export const saveDailyQuizAnswers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        const jobId = getSingleParam(req.params.jobId);
        const quizId = getSingleParam(req.params.quizId);
        const answers = req.body.answers;
        const doneAt : any = typeof req.body.doneAt === 'string' ? req.body.doneAt : undefined;
        const timezone = typeof req.body.timezone === 'string' ? req.body.timezone : undefined;

        if (doneAt && !LOCAL_DATETIME_REGEX.test(doneAt)) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }


        if (!jobId || !quizId) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        if (!userId) {
            return sendResponse(res, 401, {code: MURYA_ERROR.AUTH_REQUIRED});
        }
        if (!answers || !Array.isArray(answers) || answers.length === 0) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }

        for (const answer of answers) {
            if (!answer?.questionId) {
                return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
            }
            if (typeof answer.timeToAnswer !== 'number') {
                return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
            }
            const hasResponseIds = Array.isArray(answer.responseIds) && answer.responseIds.length > 0;
            const hasFreeText = typeof answer.freeTextAnswer === 'string' && answer.freeTextAnswer.trim().length > 0;
            if (!hasResponseIds && !hasFreeText) {
                return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
            }
        }

        const result = await jobService.saveQuizAnswersAndComplete(
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
        const statusCode = typeof (err as any)?.statusCode === 'number' ? (err as any).statusCode : 500;
        const code =
            (err as any)?.code ??
            (statusCode === 401
                ? MURYA_ERROR.AUTH_REQUIRED
                : statusCode === 403
                    ? MURYA_ERROR.FORBIDDEN
                    : statusCode === 404
                        ? MURYA_ERROR.NOT_FOUND
                        : statusCode === 409
                            ? MURYA_ERROR.CONFLICT
                            : statusCode >= 500
                                ? MURYA_ERROR.INTERNAL_ERROR
                                : MURYA_ERROR.INVALID_REQUEST);
        return sendResponse(res, statusCode, {
            code,
        });
    }
};

export const listLearningResourcesForUserJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        const userJobId = getSingleParam(req.params.userJobId);

        if (!userJobId) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        if (!userId) {
            return sendResponse(res, 401, {code: MURYA_ERROR.AUTH_REQUIRED});
        }

        const resources = await jobService.listLearningResourcesForUserJob(userJobId, userId, await detectLanguage(req));
        return sendResponse(res, 200, {data: resources});
    } catch (err) {
        console.error('listLearningResourcesForUserJob error:', err);
        return sendResponse(res, 500, {
            code: MURYA_ERROR.INTERNAL_ERROR,
        });
    }
};

// getUserJob
export const getUserJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        const jobId = getSingleParam(req.params.jobId);

        if (!jobId) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        if (!userId) {
            return sendResponse(res, 401, {code: MURYA_ERROR.AUTH_REQUIRED});
        }

        const userJob = await jobService.getUserJob(jobId, userId, await detectLanguage(req));
        if (!userJob) {
            return sendResponse(res, 404, {code: MURYA_ERROR.NOT_FOUND});
        }

        return sendResponse(res, 200, {data: userJob});
    } catch (err) {
        console.error('getUserJob error:', err);
        return sendResponse(res, 500, {
            code: MURYA_ERROR.INTERNAL_ERROR,
        });
    }
};


export const getUserJobCompetencyProfileHandler = async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.userId;
    const userJobId = getSingleParam(req.params.userJobId); // ou query/body

    try {
        if (!userJobId) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        const profile = await jobService.getUserJobCompetencyProfile(userId, userJobId, await detectLanguage(req));
        sendResponse(res, 200, {data: profile});
    } catch (e: any) {
        console.error(e);
        sendResponse(res, 500, {
            code: MURYA_ERROR.INTERNAL_ERROR,
        });
    }
};

// generateMarkdownArticleForLastQuiz
export const generateMarkdownArticleForLastQuiz2 = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;
        const userJobId = getSingleParam(req.params.userJobId);

        if (!userJobId) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        if (!userId) {
            return sendResponse(res, 401, {code: MURYA_ERROR.AUTH_REQUIRED});
        }

        const article = await generateMarkdownArticleForLastQuiz(userJobId, userId);
        return sendResponse(res, 200, {data: article});
    } catch (err) {
        console.error('generateMarkdownArticleForLastQuiz error:', err);
        return sendResponse(res, 500, {
            code: MURYA_ERROR.INTERNAL_ERROR,
        });
    }
};
