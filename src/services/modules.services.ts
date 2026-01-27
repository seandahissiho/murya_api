import {
    LandingModuleAction,
    LandingModuleActor,
    LandingModuleAddedBy,
    ModuleStatus,
    UserModuleStatus,
} from "@prisma/client";
import {prisma} from "../config/db";
import {ServiceError} from "../utils/serviceError";
import {resolveFields} from "../i18n/translate";

const DEFAULT_LANDING_MODULE_SLUGS = ["daily-quiz", "learning-resources", "leaderboard"];
const DEFAULT_LANDING_MODULES_COUNT = DEFAULT_LANDING_MODULE_SLUGS.length;
const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 100;

type ModulesListInclude = "basic" | "full";

const encodeCursor = (offset: number) => {
    return Buffer.from(JSON.stringify({offset})).toString("base64");
};

const decodeCursor = (cursor?: string) => {
    if (!cursor) return 0;
    try {
        const parsed = JSON.parse(Buffer.from(cursor, "base64").toString("utf8"));
        if (typeof parsed?.offset !== "number" || parsed.offset < 0) {
            throw new Error("Invalid cursor");
        }
        return parsed.offset;
    } catch (err) {
        throw new ServiceError("Paramètre \"cursor\" invalide.", 400, "INVALID_CURSOR");
    }
};

export const ensureUserExists = async (userId: string) => {
    const user = await prisma.user.findUnique({
        where: {id: userId},
        select: {id: true},
    });
    if (!user) {
        throw new ServiceError("Utilisateur introuvable.", 404, "USER_NOT_FOUND");
    }
};

const fetchDefaultModules = async () => {
    const defaults = await prisma.module.findMany({
        where: {defaultOnLanding: true, status: ModuleStatus.ACTIVE},
        select: {id: true, slug: true},
    });

    if (defaults.length !== DEFAULT_LANDING_MODULES_COUNT) {
        throw new ServiceError(
            "Les modules par défaut sont mal configurés.",
            500,
            "DEFAULT_MODULES_MISCONFIGURED",
        );
    }

    const defaultsBySlug = new Map(defaults.map((item) => [item.slug, item]));
    const ordered = DEFAULT_LANDING_MODULE_SLUGS.map((slug) => {
        const match = defaultsBySlug.get(slug);
        if (!match) {
            throw new ServiceError(
                "Les modules par défaut sont mal configurés.",
                500,
                "DEFAULT_MODULES_MISCONFIGURED",
            );
        }
        return match;
    });

    return ordered;
};

const ensureDefaultLandingModules = async (userId: string) => {
    const defaults = await fetchDefaultModules();
    const defaultIds = defaults.map((item) => item.id);

    const [existingDefaults, activeOrders] = await Promise.all([
        prisma.userLandingModule.findMany({
            where: {userId, moduleId: {in: defaultIds}},
            select: {id: true, moduleId: true, removedAt: true, order: true},
        }),
        prisma.userLandingModule.findMany({
            where: {userId, removedAt: null},
            select: {order: true},
        }),
    ]);

    const missingDefaults = defaults.filter(
        (item) => !existingDefaults.some((existing) => existing.moduleId === item.id),
    );
    const reEnableDefaults = existingDefaults.filter((item) => item.removedAt !== null);

    if (missingDefaults.length === 0 && reEnableDefaults.length === 0) {
        return;
    }

    let nextOrder = activeOrders.reduce((max, item) => Math.max(max, item.order), 0);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
        for (const moduleItem of missingDefaults) {
            nextOrder += 1;
            await tx.userLandingModule.create({
                data: {
                    userId,
                    moduleId: moduleItem.id,
                    order: nextOrder,
                    addedBy: LandingModuleAddedBy.SYSTEM,
                    addedAt: now,
                },
            });
            await tx.userLandingModuleEvent.create({
                data: {
                    userId,
                    moduleId: moduleItem.id,
                    action: LandingModuleAction.ADD,
                    actor: LandingModuleActor.SYSTEM,
                    createdAt: now,
                },
            });
        }

        for (const existing of reEnableDefaults) {
            await tx.userLandingModule.update({
                where: {id: existing.id},
                data: {
                    removedAt: null,
                    addedBy: LandingModuleAddedBy.SYSTEM,
                    addedAt: now,
                },
            });
            await tx.userLandingModuleEvent.create({
                data: {
                    userId,
                    moduleId: existing.moduleId,
                    action: LandingModuleAction.ADD,
                    actor: LandingModuleActor.SYSTEM,
                    createdAt: now,
                },
            });
        }
    });
};

export const listModules = async (options?: {
    include?: ModulesListInclude;
    limit?: number;
    cursor?: string;
    lang?: string;
}) => {
    const include = options?.include ?? "basic";
    const limit = Math.min(
        Math.max(options?.limit ?? DEFAULT_LIST_LIMIT, 1),
        MAX_LIST_LIMIT,
    );
    const offset = decodeCursor(options?.cursor);
    const lang = options?.lang ?? "en";

    const modules = await prisma.module.findMany({
        where: {status: ModuleStatus.ACTIVE},
        orderBy: [{createdAt: "asc"}, {id: "asc"}],
        skip: offset,
        take: limit + 1,
    });

    const hasMore = modules.length > limit;
    const items = modules.slice(0, limit);

    const translated = await Promise.all(
        items.map(async (item) => {
            const localized = await resolveFields({
                entity: "Module",
                entityId: item.id,
                fields: ["name", "description"],
                lang,
                base: {name: item.name, description: item.description},
            });

            if (include === "full") {
                return {
                    id: item.id,
                    slug: item.slug,
                    name: localized.name,
                    description: localized.description,
                    status: item.status,
                    visibility: item.visibility,
                    defaultOnLanding: item.defaultOnLanding,
                    createdAt: item.createdAt,
                    updatedAt: item.updatedAt,
                };
            }

            return {
                id: item.id,
                slug: item.slug,
                name: localized.name,
            };
        }),
    );

    return {
        data: translated,
        paging: {
            limit,
            nextCursor: hasMore ? encodeCursor(offset + limit) : null,
        },
    };
};

export const listUserModules = async (userId: string) => {
    return prisma.userModule.findMany({
        where: {userId},
        orderBy: {createdAt: "asc"},
        select: {
            moduleId: true,
            status: true,
            createdAt: true,
            updatedAt: true,
        },
    });
};

export const listUserLandingModules = async (userId: string) => {
    await ensureDefaultLandingModules(userId);
    return prisma.userLandingModule.findMany({
        where: {userId, removedAt: null, module: {status: ModuleStatus.ACTIVE}},
        orderBy: [{order: "asc"}, {addedAt: "asc"}],
        select: {
            moduleId: true,
            order: true,
            addedBy: true,
            addedAt: true,
        },
    });
};

export const addUserLandingModule = async (
    userId: string,
    moduleId: string,
    order: number,
) => {
    const moduleRecord = await prisma.module.findUnique({
        where: {id: moduleId},
        select: {id: true, status: true},
    });

    if (!moduleRecord) {
        throw new ServiceError("Module introuvable.", 404, "MODULE_NOT_FOUND");
    }

    if (moduleRecord.status !== ModuleStatus.ACTIVE) {
        throw new ServiceError("Module inactif.", 400, "MODULE_INACTIVE");
    }

    await ensureDefaultLandingModules(userId);

    const existing = await prisma.userLandingModule.findUnique({
        where: {userId_moduleId: {userId, moduleId}},
        select: {id: true, removedAt: true},
    });

    if (existing && existing.removedAt === null) {
        throw new ServiceError("Module déjà présent sur la landing.", 409, "MODULE_EXISTS");
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
        if (existing) {
            await tx.userLandingModule.update({
                where: {id: existing.id},
                data: {
                    removedAt: null,
                    order,
                    addedBy: LandingModuleAddedBy.USER,
                    addedAt: now,
                },
            });
        } else {
            await tx.userLandingModule.create({
                data: {
                    userId,
                    moduleId,
                    order,
                    addedBy: LandingModuleAddedBy.USER,
                    addedAt: now,
                },
            });
        }

        await tx.userLandingModuleEvent.create({
            data: {
                userId,
                moduleId,
                action: LandingModuleAction.ADD,
                actor: LandingModuleActor.USER,
                createdAt: now,
            },
        });

        const existingUserModule = await tx.userModule.findUnique({
            where: {userId_moduleId: {userId, moduleId}},
            select: {id: true},
        });

        if (!existingUserModule) {
            await tx.userModule.create({
                data: {userId, moduleId, status: UserModuleStatus.ACTIVE},
            });
        }
    });

    return {
        moduleId,
        order,
        addedBy: LandingModuleAddedBy.USER,
        addedAt: now,
    };
};

export const removeUserLandingModule = async (userId: string, moduleId: string) => {
    const moduleRecord = await prisma.module.findUnique({
        where: {id: moduleId},
        select: {id: true, defaultOnLanding: true},
    });

    if (!moduleRecord) {
        throw new ServiceError("Module introuvable.", 404, "MODULE_NOT_FOUND");
    }

    if (moduleRecord.defaultOnLanding) {
        throw new ServiceError(
            "Ce module par défaut ne peut pas être retiré.",
            403,
            "MODULE_DEFAULT_FORBIDDEN",
        );
    }

    await ensureDefaultLandingModules(userId);

    const landing = await prisma.userLandingModule.findUnique({
        where: {userId_moduleId: {userId, moduleId}},
        select: {id: true, removedAt: true},
    });

    if (!landing || landing.removedAt !== null) {
        throw new ServiceError("Module absent de la landing.", 404, "MODULE_NOT_ON_LANDING");
    }

    const now = new Date();

    await prisma.$transaction([
        prisma.userLandingModule.update({
            where: {id: landing.id},
            data: {removedAt: now},
        }),
        prisma.userLandingModuleEvent.create({
            data: {
                userId,
                moduleId,
                action: LandingModuleAction.REMOVE,
                actor: LandingModuleActor.USER,
                createdAt: now,
            },
        }),
    ]);

    return {
        moduleId,
        removedAt: now,
    };
};

export const reorderUserLandingModules = async (
    userId: string,
    orders: Array<{moduleId: string; order: number}>,
) => {
    await ensureDefaultLandingModules(userId);

    const current = await prisma.userLandingModule.findMany({
        where: {userId, removedAt: null, module: {status: ModuleStatus.ACTIVE}},
        select: {moduleId: true},
    });

    const currentIds = new Set(current.map((item) => item.moduleId));
    const requestedIds = new Set(orders.map((item) => item.moduleId));

    if (currentIds.size !== requestedIds.size) {
        throw new ServiceError("Liste de modules incohérente.", 400, "ORDER_INCONSISTENT");
    }

    for (const moduleId of requestedIds) {
        if (!currentIds.has(moduleId)) {
            throw new ServiceError("Liste de modules incohérente.", 400, "ORDER_INCONSISTENT");
        }
    }

    const orderValues = orders.map((item) => item.order);
    const uniqueOrderValues = new Set(orderValues);
    if (uniqueOrderValues.size !== orderValues.length) {
        throw new ServiceError("Ordres dupliqués.", 400, "ORDER_DUPLICATE");
    }

    await prisma.$transaction(
        orders.map((item) =>
            prisma.userLandingModule.update({
                where: {userId_moduleId: {userId, moduleId: item.moduleId}},
                data: {order: item.order},
            }),
        ),
    );

    return {updated: orders.length};
};

export const listUserLandingModuleEvents = async (userId: string, since?: Date) => {
    return prisma.userLandingModuleEvent.findMany({
        where: {
            userId,
            ...(since ? {createdAt: {gte: since}} : {}),
        },
        orderBy: {createdAt: "asc"},
        select: {
            id: true,
            moduleId: true,
            action: true,
            actor: true,
            createdAt: true,
        },
    });
};
