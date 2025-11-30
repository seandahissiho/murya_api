import {NextFunction, Request, Response} from "express";
import * as competencyService from "../services/competencies.services";
import {sendResponse} from "../utils/helpers";
import {detectLanguage} from "../middlewares/i18n";


export const searchCompetencies = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const query = (req.query.query as string)?.trim() || "";
        if (query === undefined) {
            return sendResponse(res, 400, {error: 'Le paramètre "query" est requis.'});
        }

        const page = parseInt((req.query.page as string) || '1', 10);
        const perPage = parseInt((req.query.perPage as string) || '20', 10);

        const lang = await detectLanguage(req);

        const result = await competencyService.searchCompetencies(query, {page, perPage, lang});
        return sendResponse(res, 200, {data: result});
    } catch (err) {
        console.error('searchCompetencies error:', err);
        return sendResponse(res, 500, {
            error: "Une erreur s'est produite lors de la recherche.",
            message: err instanceof Error ? err.message : 'Unknown error'
        });
    }
};

export const getCompetenciesFamiliesAndSubFamilies = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const lang = await detectLanguage(req);

        const result = await competencyService.getCompetenciesFamiliesAndSubFamilies(lang);
        return sendResponse(res, 200, {data: result});
    } catch (err) {
        console.error('getCompetenciesFamiliesAndSubFamilies error:', err);
        return sendResponse(res, 500, {
            error: "Une erreur s'est produite lors de la récupération des familles et sous-familles.",
            message: err instanceof Error ? err.message : 'Unknown error'
        });
    }
}

export const getCompetenciesFamilies = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const lang = await detectLanguage(req);

        const result = await competencyService.getCompetenciesFamilies(lang);
        return sendResponse(res, 200, {data: result});
    } catch (err) {
        console.error('getCompetenciesFamilies error:', err);
        return sendResponse(res, 500, {
            error: "Une erreur s'est produite lors de la récupération des familles.",
            message: err instanceof Error ? err.message : 'Unknown error'
        });
    }
}