import {NextFunction, Request, Response} from "express";
import * as jobService from "../services/jobs.services";
import {sendResponse} from "../utils/helpers";
import {detectLanguage} from "../middlewares/i18n";


export const searchJobs = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const query = (req.query.query as string)?.trim();
        if (query === undefined) {
            return sendResponse(res, 400, {error: 'Le paramètre "query" est requis.'});
        }

        const page = parseInt((req.query.page as string) || '1', 10);
        const perPage = parseInt((req.query.perPage as string) || '20', 10);

        const lang = await detectLanguage(req);

        const result = await jobService.searchJobs(query, {page, perPage, lang});
        return sendResponse(res, 200, {data: result});
    } catch (err) {
        console.error('searchJobs error:', err);
        return sendResponse(res, 500, {
            error: "Une erreur s'est produite lors de la recherche.",
            message: err instanceof Error ? err.message : 'Unknown error'
        });
    }
};

export const getJobDetails = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const jobId = req.params.id;
        if (!jobId) {
            return sendResponse(res, 400, {error: 'L’identifiant du job est requis.'});
        }

        const lang = await detectLanguage(req);

        const job = await jobService.getJobDetails(jobId, lang);
        if (!job) {
            return sendResponse(res, 404, {error: 'Job non trouvé.'});
        }

        return sendResponse(res, 200, {data: job});
    } catch (err) {
        console.error('getJobDetails error:', err);
        return sendResponse(res, 500, {
            error: "Une erreur s'est produite lors de la récupération des détails.",
            message: err instanceof Error ? err.message : 'Unknown error'
        });
    }
};

export const getCompetencyFamilyDetailsForJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const jobId = req.params.jobId;
        const cfId = req.params.cfId;
        if (!jobId || !cfId) {
            return sendResponse(res, 400, {error: 'jobId et cfId sont requis.'});
        }

        const lang = await detectLanguage(req);

        const details = await jobService.getCompetencyFamilyDetailsForJob(jobId, cfId, lang);
        if (!details) {
            return sendResponse(res, 404, {error: 'Détails introuvables pour cette famille de compétences.'});
        }

        return sendResponse(res, 200, {data: details});
    } catch (err) {
        console.error('getCompetencyFamilyDetailsForJob error:', err);
        return sendResponse(res, 500, {
            error:
                "Une erreur s'est produite lors de la récupération des détails de la famille de compétences.",
            message: err instanceof Error ? err.message : 'Unknown error'
        });
    }
};
