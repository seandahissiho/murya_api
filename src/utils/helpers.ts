import {Response} from "express";
import bcrypt from "bcryptjs";

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
        response.error = error.message;
    }
    return res.status(statusCode).json(response);
}

export async function encryptPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, 10);
}

export function getSingleParam(value: string | string[] | undefined): string | undefined {
    if (Array.isArray(value)) {
        return value[0];
    }
    return value;
}
