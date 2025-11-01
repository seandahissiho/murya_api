// noinspection TypeScriptUnresolvedReference

import {Prisma, PrismaClient} from "@prisma/client";
import multer from "multer";


const prismaExtension = Prisma.defineExtension((prisma) =>
    prisma.$extends({
        model: {},
        query: {},
    }),
);

const prisma = new PrismaClient(
    // {log: ['query', 'error']},
).$extends(prismaExtension);

const upload = multer({
    limits: {fileSize: 50 * 1024 * 1024}, // Limit file size to 5MB
    fileFilter: (req: any, file: any, cb: any) => {
        return cb(null, true);
    },
});


// export default prisma;
export {prisma, upload};
