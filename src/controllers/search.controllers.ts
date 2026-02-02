import {NextFunction, Request, Response} from 'express';
import {ParsedQs} from 'qs';
import {getSingleParam, sendResponse, QueryParamValue} from '../utils/helpers';
import {MURYA_ERROR} from '../constants/errorCodes';
import {getDefaultSections, globalSearch, SearchSectionKey} from '../services/search.services';
import {detectLanguage} from "../middlewares/i18n";

const MAX_QUERY_LENGTH = 120;
const MIN_QUERY_LENGTH = 0;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const DEFAULT_TIMEOUT_MS = 35000;

const parseBoolean = (value: QueryParamValue, fallback: boolean) => {
    const raw = getSingleParam(value);
    if (!raw) {
        return fallback;
    }
    return raw === 'true' || raw === '1';
};

const parseSections = (value: QueryParamValue) => {
    const raw = getSingleParam(value);
    if (!raw) {
        return getDefaultSections();
    }
    const allowed: SearchSectionKey[] = ['jobs', 'jobFamilies', 'learningResources', 'users'];
    const map = new Map<string, SearchSectionKey>(allowed.map((key) => [key.toLowerCase(), key]));
    const selections = raw
        .split(',')
        .map((section) => section.trim().toLowerCase())
        .map((section) => map.get(section))
        .filter((section): section is SearchSectionKey => Boolean(section));
    if (!selections.length) {
        return null;
    }
    return new Set<SearchSectionKey>(selections);
};

export const globalSearchHandler = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const query = getSingleParam(req.query.q);
        if (query === undefined) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        const trimmed = query.trim();
        if (trimmed.length > MAX_QUERY_LENGTH) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }

        const sections = parseSections(req.query.sections);
        if (!sections) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }

        const limitRaw = parseInt(getSingleParam(req.query.limit) ?? '', 10);
        const limit = Number.isFinite(limitRaw)
            ? Math.max(1, Math.min(MAX_LIMIT, limitRaw))
            : DEFAULT_LIMIT;

        const includeTotal = parseBoolean(req.query.includeTotal, false);
        const userId = (req as any)?.user?.userId as string | undefined;
        if (!userId) {
            return sendResponse(res, 401, {code: MURYA_ERROR.AUTH_REQUIRED});
        }

        const lang = await detectLanguage(req);

        const result = await globalSearch({
            userId,
            query: trimmed,
            limit,
            includeTotal,
            sections,
            timeoutMs: DEFAULT_TIMEOUT_MS,
            lang,
        });

        return sendResponse(res, 200, result);
    } catch (err) {
        console.error('globalSearchHandler error:', err);
        return sendResponse(res, 500, {code: MURYA_ERROR.INTERNAL_ERROR});
    }
};
