import {NextFunction, Request, Response} from "express";
import * as jobService from "../services/jobs.services";
import {getSingleParam, sendResponse} from "../utils/helpers";
import {detectLanguage} from "../middlewares/i18n";
import {MURYA_ERROR} from "../constants/errorCodes";


export const searchJobs = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const query = (req.query.query as string)?.trim();
        if (query === undefined) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }

        const page = parseInt((req.query.page as string) || '1', 10);
        const perPage = parseInt((req.query.perPage as string) || '20', 10);

        const lang = await detectLanguage(req);

        const result = await jobService.searchJobs(query, {page, perPage, lang});
        return sendResponse(res, 200, {data: result});
    } catch (err) {
        console.error('searchJobs error:', err);
        return sendResponse(res, 500, {
            code: MURYA_ERROR.INTERNAL_ERROR,
        });
    }
};

export const getJobsFamiliesAndSubFamilies = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const lang = await detectLanguage(req);
        const data = await jobService.getJobsFamiliesAndSubFamilies(lang);
        return sendResponse(res, 200, {data});
    } catch (err) {
        return sendResponse(res, 500, {
            code: MURYA_ERROR.INTERNAL_ERROR,
        });
    }
}


export const getJobDetails = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const jobId = getSingleParam(req.params.id);
        if (!jobId) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }

        const lang = await detectLanguage(req);

        const job = await jobService.getJobDetails(jobId, lang);
        if (!job) {
            const jobFamily = await jobService.getJobFamilyDetails(jobId, lang);
            if (!jobFamily) {
                return sendResponse(res, 404, {code: MURYA_ERROR.NOT_FOUND});
            }
            return sendResponse(res, 200, {data: jobFamily});
        }

        return sendResponse(res, 200, {data: job});
    } catch (err) {
        console.error('getJobDetails error:', err);
        return sendResponse(res, 500, {
            code: MURYA_ERROR.INTERNAL_ERROR,
        });
    }
};

export const getJobDetailsByName = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const name = getSingleParam(req.params.slug);
        if (!name) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }

        const lang = await detectLanguage(req);

        const job = await jobService.getJobDetailsByName(name, lang);

        if (!job) {
            return sendResponse(res, 404, {code: MURYA_ERROR.NOT_FOUND});
        }

        return sendResponse(res, 200, {data: job});

    } catch (err) {
        console.error('getJobDetailsByName error:', err);
        return sendResponse(res, 500, {
            code: MURYA_ERROR.INTERNAL_ERROR,
        });
    }
}

export const getCompetencyFamilyDetailsForJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const jobId = getSingleParam(req.params.jobId);
        const cfId = getSingleParam(req.params.cfId);
        if (!jobId || !cfId) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }

        const lang = await detectLanguage(req);

        const details = await jobService.getCompetencyFamilyDetailsForJob(jobId, cfId, lang);
        if (!details) {
            return sendResponse(res, 404, {code: MURYA_ERROR.NOT_FOUND});
        }

        return sendResponse(res, 200, {data: details});
    } catch (err) {
        console.error('getCompetencyFamilyDetailsForJob error:', err);
        return sendResponse(res, 500, {
            code: MURYA_ERROR.INTERNAL_ERROR,
        });
    }
};

export const createJobWithCompetencies = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const payload = req.body;
        if (!payload?.jobTitle) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }

        const job = await jobService.createJobWithCompetencies(payload);
        return sendResponse(res, 201, {data: job});
    } catch (err) {
        console.error('createJobWithCompetencies error:', err);
        return sendResponse(res, 500, {
            code: MURYA_ERROR.INTERNAL_ERROR,
        });
    }
};

export const savePositioningQuizzesForJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const payload = req.body;
        if (!payload?.jobTitle) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }

        if (!payload?.slug && req.params.slug) {
            payload.slug = req.params.slug;
        }

        const result = await jobService.savePositioningQuizzesForJob(payload);
        return sendResponse(res, 201, {data: result});
    } catch (err) {
        console.error('savePositioningQuizzesForJob error:', err);
        return sendResponse(res, 500, {
            code: MURYA_ERROR.INTERNAL_ERROR,
        });
    }
};
