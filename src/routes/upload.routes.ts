import {Router} from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import * as uploadController from '../controllers/upload.controllers';

const router = Router();

// Ensure base folder exists
const baseDir = path.join(process.cwd(), "uploads");
fs.mkdirSync(baseDir, {recursive: true});

// Multer storage to disk, bucketed by workspace
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const dir = path.join(baseDir);
        fs.mkdirSync(dir, {recursive: true});
        cb(null, dir);
    },
    filename: (_req, file, cb) => {
        // Keep original name or generate your own
        const ts = Date.now();
        const safe = file.originalname.replace(/[^\w.\-]/g, "_");
        cb(null, `${ts}-${safe}`);
    },
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {fileSize: 15 * 1024 * 1024}, // 15MB
    fileFilter: (_req, file, cb) => {
        // Example: simple allow-list
        const allowed = [
            "image/png",
            "image/jpeg",
            "image/webp",
            // pdf
            "application/pdf",
            // docx, xlsx, pptx
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            // older office formats
            "application/msword",
            "application/vnd.ms-excel",
            "application/vnd.ms-powerpoint",
        ];
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error("Unsupported file type"));
        }
        cb(null, true);
    },
});


router.get('/', uploadController.getAllFiles);
router.get('/:id', uploadController.getFileById);
router.post('/', upload.single("file"), uploadController.uploadFile);
router.put('/:id', upload.single("file"), uploadController.updateFile);
router.delete('/:id', uploadController.deleteFile);

export default router;
