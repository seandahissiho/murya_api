import {Response} from "express";
import bcrypt from "bcryptjs";
import {ParsedQs} from "qs";
import {MURYA_ERROR} from "../constants/errorCodes";

export type QueryParamValue = string | ParsedQs | (string | ParsedQs)[] | undefined;

interface ApiResponse<T> {
    data?: any;
    pagination?: {
        totalItems: number;
        totalPages: number;
        currentPage: number;
        itemsPerPage: number;
    };
    message?: string;
    error?: string;
    [key: string]: any;
}

export function sendResponse<T>(
    res: Response,
    statusCode: number,
    response: ApiResponse<T>,
    error?: any,
) {
    // check error's type
    if (error && error instanceof Error) {
        statusCode = 400;
        response = {code: MURYA_ERROR.INVALID_REQUEST};
    }
    if (statusCode >= 400) {
        const code = (response as any)?.code ?? MURYA_ERROR.INTERNAL_ERROR;
        response = {code};
    }
    return res.status(statusCode).json(response);
}

export async function encryptPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, 10);
}

export function getSingleParam(value: QueryParamValue): string | undefined {
    if (Array.isArray(value)) {
        const first = value[0];
        return typeof first === "string" ? first : undefined;
    }
    if (typeof value === "string") {
        return value;
    }
    return undefined;
}
