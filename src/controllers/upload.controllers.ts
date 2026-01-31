import {NextFunction, Request, Response} from "express";
import * as uploadService from "../services/upload.services";
import {getSingleParam, sendResponse} from "../utils/helpers";
import {MURYA_ERROR} from "../constants/errorCodes";

export const getAllFiles = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const uploads = await uploadService.getAllUploads();
        sendResponse(
            res,
            200,
            {
                message: 'Les fichiers ont été récupérées avec succès',
                data: uploads
            }
        );
    } catch (err) {
        sendResponse(
            res,
            500,
            {
                code: MURYA_ERROR.INTERNAL_ERROR,
            }
        );
    }
}

export const getFileById = async (req: Request, res: Response, next: NextFunction) => {
    const id = getSingleParam(req.params.id);
    try {
        if (!id) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        const upload = await uploadService.getUploadById(id);
        if (!upload) {
            return sendResponse(res, 404, {code: MURYA_ERROR.NOT_FOUND});
        }
        sendResponse(
            res,
            200,
            {
                data: upload,
                message: 'Fichier récupérée avec succès'
            }
        );
    } catch (err) {
        sendResponse(
            res,
            500,
            {
                code: MURYA_ERROR.INTERNAL_ERROR,
            }
        );
    }
}

export const uploadFile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user.userId;
        if (!req.file) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        // Assuming file is available in req.file (using multer or similar middleware)
        if (!req.file) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }

        const data = {
            userId,
            file: req.file,
        }
        const upload = await uploadService.createUpload(data);
        sendResponse(
            res,
            201,
            {
                message: 'Fichier uploadé avec succès',
                data: upload
            }
        );
    } catch (err) {
        sendResponse(
            res,
            500,
            {
                code: MURYA_ERROR.INTERNAL_ERROR,
            }
        );
    }
}

export const updateFile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user.userId;
        const id = getSingleParam(req.params.id);
        if (!id) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        if (!req.file) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        // Assuming file is available in req.file (using multer or similar middleware)
        if (!req.file) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        const data = {
            userId,
            file: req.file,
        }
        const updatedUpload = await uploadService.updateUpload(id, data);
        if (!updatedUpload) {
            return sendResponse(res, 404, {code: MURYA_ERROR.NOT_FOUND});
        }
        sendResponse(
            res,
            200,
            {
                message: 'Fichier mis à jour avec succès',
                data: updatedUpload
            }
        );
    } catch (err) {
        sendResponse(
            res,
            500,
            {
                code: MURYA_ERROR.INTERNAL_ERROR,
            }
        );
    }
}

export const deleteFile = async (req: Request, res: Response, next: NextFunction) => {
    const id = getSingleParam(req.params.id);
    try {
        if (!id) {
            return sendResponse(res, 400, {code: MURYA_ERROR.INVALID_REQUEST});
        }
        const deletedUpload = await uploadService.deleteUpload(id);
        if (!deletedUpload) {
            return sendResponse(res, 404, {code: MURYA_ERROR.NOT_FOUND});
        }
        sendResponse(
            res,
            200,
            {
                message: 'Fichier supprimé avec succès',
                data: deletedUpload
            }
        );
    } catch (err) {
        sendResponse(
            res,
            500,
            {
                code: MURYA_ERROR.INTERNAL_ERROR,
            }
        );
    }
}
