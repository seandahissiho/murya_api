import {NextFunction, Request, Response} from "express";
import * as jobService from "../services/jobs.services";
import {sendResponse} from "../utils/helpers";

export const searchJobs = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const query: string = req.query.query as string;
        const jobs = await jobService.searchJobs(query);
        return sendResponse(res, 200, {data: jobs});
    } catch (err) {
        sendResponse(
            res,
            500,
            {
                error: "Une erreur s'est produite lors de la recherche.",
                message: err instanceof Error ? err.message : 'Unknown error'
            }
        );
    }
};

// getJobDetails
export const getJobDetails = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const jobId = req.params.id;
        const job = await jobService.getJobDetails(jobId);
        return sendResponse(res, 200, {data: job});
    } catch (err) {
        sendResponse(
            res,
            500,
            {
                error: "Une erreur s'est produite lors de la récupération des détails.",
                message: err instanceof Error ? err.message : 'Unknown error'
            }
        );
    }
};


export const getCompetencyFamilyDetailsForJob = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const jobId = req.params.jobId;
        const cfId = req.params.cfId;
        const competencyFamilyDetails = await jobService.getCompetencyFamilyDetailsForJob(jobId, cfId);
        return sendResponse(res, 200, {data: competencyFamilyDetails});
    } catch (err) {
        sendResponse(
            res,
            500,
            {
                error: "Une erreur s'est produite lors de la récupération des détails de la famille de compétences.",
                message: err instanceof Error ? err.message : 'Unknown error'
            }
        );
    }
}

