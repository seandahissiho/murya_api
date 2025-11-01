import {NextFunction, Request, Response} from "express";
import * as uploadService from "../services/upload.services";
import {sendResponse} from "../utils/helpers";

export const getAllFiles = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = (req as any).user.workspaceId;
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
                error: "Une erreur s'est produite lors de la récupération des factures",
                message: err instanceof Error ? err.message : 'Unknown error'
            }
        );
    }
}

export const getFileById = async (req: Request, res: Response, next: NextFunction) => {
    const workspaceId = (req as any).user.workspaceId;
    const id = req.params.id;
    try {
        const upload = await uploadService.getUploadById(id);
        if (!upload) {
            return res.status(404).json({message: 'Fichier non trouvée'});
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
                error: "Une erreur s'est produite lors de la récupération du fichier",
                message: err instanceof Error ? err.message : 'Unknown error'
            }
        );
    }
}

export const uploadFile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = (req as any).user.workspaceId;
        const userId = (req as any).user.userId;
        if (!workspaceId || !req.file) {
            return res.status(400).json({error: "workspaceId and file are required"});
        }
        // Assuming file is available in req.file (using multer or similar middleware)
        if (!req.file) {
            return res.status(400).json({message: 'No file uploaded'});
        }

        const data = {
            workspaceId,
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
                error: "Une erreur s'est produite lors de l'upload du fichier",
                message: err instanceof Error ? err.message : 'Unknown error'
            }
        );
    }
}

export const updateFile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = (req as any).user.workspaceId;
        const userId = (req as any).user.userId;
        const id = req.params.id;
        if (!workspaceId || !req.file) {
            return res.status(400).json({error: "workspaceId and file are required"});
        }
        // Assuming file is available in req.file (using multer or similar middleware)
        if (!req.file) {
            return res.status(400).json({message: 'No file uploaded'});
        }
        const data = {
            workspaceId,
            userId,
            file: req.file,
        }
        const updatedUpload = await uploadService.updateUpload(id, data);
        if (!updatedUpload) {
            return res.status(404).json({message: 'Fichier non trouvée'});
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
                error: "Une erreur s'est produite lors de la mise à jour du fichier",
                message: err instanceof Error ? err.message : 'Unknown error'
            }
        );
    }
}

export const deleteFile = async (req: Request, res: Response, next: NextFunction) => {
    const workspaceId = (req as any).user.workspaceId;
    const id = req.params.id;
    try {
        const deletedUpload = await uploadService.deleteUpload(id);
        if (!deletedUpload) {
            return res.status(404).json({message: 'Fichier non trouvée'});
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
                error: "Une erreur s'est produite lors de la suppression du fichier",
                message: err instanceof Error ? err.message : 'Unknown error'
            }
        );
    }
}
