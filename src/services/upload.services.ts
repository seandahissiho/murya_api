import {prisma} from "../config/db";
import path from "node:path";
import fs from "node:fs/promises";

const baseDir = path.join(process.cwd(), "uploads");

function toLocalDiskPath(fileUrl: string): string {
    // Accept absolute URL or relative path, normalize to a pathname
    const pathname = (() => {
        try { return new URL(fileUrl).pathname; } catch { return fileUrl; }
    })();

    // Only allow our local served prefix
    if (!pathname.startsWith("/uploads/")) {
        throw new Error("Not a local disk-backed file_url");
    }

    // Map /uploads/... to <baseDir>/...
    const rel = pathname.replace(/^\/uploads\//, "");
    const abs = path.resolve(baseDir, rel);

    // Block path traversal (..)
    if (!abs.startsWith(baseDir + path.sep)) {
        throw new Error("Path traversal blocked");
    }
    return abs;
}

async function unlinkIfExists(p: string) {
    try { await fs.unlink(p); }
    catch (e: any) { if (e?.code !== "ENOENT") throw e; }
}

async function removeEmptyParents(startPath: string) {
    // Clean empty directories up to baseDir
    let dir = path.dirname(startPath);
    while (dir.startsWith(baseDir)) {
        try {
            const entries = await fs.readdir(dir);
            if (entries.length > 0) break;
            await fs.rmdir(dir);
            dir = path.dirname(dir);
        } catch { break; }
    }
}


const UPLOADS_INCLUDES = {
};

export const getAllUploads = async () => {
    return prisma.uploadedFile.findMany({
        orderBy: {createdAt: 'desc'},
        include: UPLOADS_INCLUDES,
    });
}

export const getUploadById = async (id: string) => {
    return prisma.uploadedFile.findFirst({
        where: {id},
        include: UPLOADS_INCLUDES,
    });
}

export const createUpload = async (data: any) => {
    const userId = data.userId;
    const file = data.file;
    const relPath = `/uploads/${file.filename}`; // URL you can serve
    const mimeType = file.mimetype || "application/octet-stream";
    const size = file.size;
    const buffer: any = file.buffer;
    return await prisma.uploadedFile.create({
        data: {
            createdById: userId || null,
            file_name: file.originalname,
            file_url: relPath, // store a URL you can return/use in UI
            mimeType,
            size,
            content: buffer,
        },
        include: UPLOADS_INCLUDES,
    });
}

export const updateUpload = async (id: string, data: any) => {
    const userId = data.userId;
    const file = data.file;
    const relPath = `/uploads/${file.filename}`; // URL you can serve
    const mimeType = file.mimetype || "application/octet-stream";
    const size = file.size;
    const buffer: any = file.buffer;

    return await prisma.uploadedFile.update({
        where: {id},
        data: {
            updatedById: userId,
            file_name: file.originalname,
            file_url: relPath, // store a URL you can return/use in UI
            mimeType,
            size,
            content: buffer,
        },
        include: UPLOADS_INCLUDES,
    });
}

export const deleteUpload = async (id: string) => {
    return await prisma.uploadedFile.delete({
        where: {id}
    });
}