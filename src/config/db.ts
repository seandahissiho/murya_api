// noinspection TypeScriptUnresolvedReference

import {
    LandingModuleAction,
    LandingModuleActor,
    ModuleStatus,
    Prisma,
    PrismaClient,
} from "@prisma/client";
import multer from "multer";

const removeLandingForModules = async (client: PrismaClient, moduleIds: string[]) => {
    if (moduleIds.length === 0) return;

    const now = new Date();
    const landingRows = await client.userLandingModule.findMany({
        where: {moduleId: {in: moduleIds}, removedAt: null},
        select: {userId: true, moduleId: true},
    });

    if (landingRows.length === 0) return;

    await client.$transaction([
        client.userLandingModule.updateMany({
            where: {moduleId: {in: moduleIds}, removedAt: null},
            data: {removedAt: now},
        }),
        client.userLandingModuleEvent.createMany({
            data: landingRows.map((row) => ({
                userId: row.userId,
                moduleId: row.moduleId,
                action: LandingModuleAction.REMOVE,
                actor: LandingModuleActor.SYSTEM,
                createdAt: now,
            })),
        }),
    ]);
};

const prismaExtension = Prisma.defineExtension((prisma) =>
    prisma.$extends({
        model: {},
        query: {
            module: {
                async update({args, query}) {
                    const before = await prisma.module.findUnique({
                        where: args.where,
                        select: {id: true, status: true},
                    });
                    const result = await query(args);
                    if (
                        before &&
                        before.status !== result.status &&
                        (result.status === ModuleStatus.INACTIVE ||
                            result.status === ModuleStatus.ARCHIVED)
                    ) {
                        await removeLandingForModules(prisma, [result.id]);
                    }
                    return result;
                },
                async updateMany({args, query}) {
                    const statusField = args.data?.status as
                        | ModuleStatus
                        | {set?: ModuleStatus}
                        | undefined;
                    const nextStatus =
                        statusField && typeof statusField === "object" && "set" in statusField
                            ? statusField.set
                            : statusField;
                    const shouldRemove =
                        nextStatus === ModuleStatus.INACTIVE ||
                        nextStatus === ModuleStatus.ARCHIVED;

                    if (!shouldRemove) {
                        return query(args);
                    }

                    const modules = await prisma.module.findMany({
                        where: args.where,
                        select: {id: true},
                    });
                    const result = await query(args);
                    await removeLandingForModules(
                        prisma,
                        modules.map((item) => item.id),
                    );
                    return result;
                },
            },
        },
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
