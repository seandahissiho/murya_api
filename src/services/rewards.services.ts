import {
    CurrencyType,
    Prisma,
    Reward,
    RewardFulfillmentMode,
    RewardKind,
    RewardPurchaseStatus,
} from "@prisma/client";
import {prisma} from "../config/db";
import {ServiceError} from "../utils/serviceError";
import {buildGoogleMapsUrl} from "../utils/address";
import {generateVoucherCode} from "../utils/rewards";
import {getTranslationsMap} from "../i18n/translate";
import {MURYA_ERROR} from "../constants/errorCodes";

const buildVisibilityFilter = (now: Date): Prisma.RewardWhereInput => ({
    AND: [
        {isActive: true},
        {
            OR: [
                {visibleFrom: null},
                {visibleFrom: {lte: now}},
            ],
        },
        {
            OR: [
                {visibleTo: null},
                {visibleTo: {gte: now}},
            ],
        },
    ],
});

const isRewardVisible = (reward: Reward, now: Date) => {
    if (!reward.isActive) {
        return false;
    }
    if (reward.visibleFrom && reward.visibleFrom > now) {
        return false;
    }
    if (reward.visibleTo && reward.visibleTo < now) {
        return false;
    }
    return true;
};

const formatAddress = (address: any) => {
    if (!address) {
        return null;
    }
    return {
        id: address.id,
        street: address.street,
        zip: address.zip,
        city: address.city,
        countryId: address.countryId,
        googleMapsUrl: buildGoogleMapsUrl(address),
    };
};

const formatPurchaseResponse = (purchase: any) => ({
    id: purchase.id,
    status: purchase.status,
    totalCostDiamonds: purchase.totalCostDiamonds,
    voucherCode: purchase.voucherCode,
    voucherLink: purchase.voucherLink,
    reward: purchase.reward ? {id: purchase.reward.id, title: purchase.reward.title} : null,
});

const resolveTranslationValue = (
    translations: Map<string, string>,
    entityId: string,
    field: string,
    fallback: string | null | undefined,
) => {
    const value = translations.get(`${entityId}::${field}`);
    if (value !== undefined) {
        return value;
    }
    return fallback ?? null;
};

const loadRewardTranslations = async (rewardIds: string[], lang: string) => {
    if (!lang || rewardIds.length === 0) {
        return new Map<string, string>();
    }
    return getTranslationsMap({
        entity: "Reward",
        entityIds: rewardIds,
        fields: ["title", "description", "redeemInstructions"],
        lang,
    });
};

const applyRewardTranslations = <T extends { id: string; title?: string | null; description?: string | null; redeemInstructions?: string | null }>(
    reward: T,
    translations: Map<string, string>,
) => ({
    ...reward,
    title: resolveTranslationValue(translations, reward.id, "title", reward.title),
    description: resolveTranslationValue(translations, reward.id, "description", reward.description),
    redeemInstructions: resolveTranslationValue(
        translations,
        reward.id,
        "redeemInstructions",
        reward.redeemInstructions,
    ),
});

const localizeReward = async <T extends { id: string; title?: string | null; description?: string | null; redeemInstructions?: string | null }>(
    reward: T,
    lang?: string,
) => {
    if (!lang) {
        return reward;
    }
    const translations = await loadRewardTranslations([reward.id], lang);
    return applyRewardTranslations(reward, translations);
};

const ensureUser = async (userId: string) => {
    const user = await prisma.user.findUnique({
        where: {id: userId},
        select: {id: true, diamonds: true, isAdmin: true},
    });
    if (!user) {
        throw new ServiceError("Utilisateur introuvable.", 404, MURYA_ERROR.USER_NOT_FOUND);
    }
    return user;
};

export const listRewards = async (
    userId: string,
    {
        city,
        kind,
        onlyAvailable,
        page = 1,
        limit = 20,
        lang = "en",
    }: {
        city?: string;
        kind?: RewardKind;
        onlyAvailable?: boolean;
        page?: number;
        limit?: number;
        lang?: string;
    },
) => {
    const user = await ensureUser(userId);
    const now = new Date();
    const skip = (page - 1) * limit;
    const where: Prisma.RewardWhereInput = buildVisibilityFilter(now);
    const andFilters: Prisma.RewardWhereInput[] = Array.isArray(where.AND)
        ? [...where.AND]
        : where.AND
            ? [where.AND]
            : [];

    if (city) {
        andFilters.push({city: {equals: city, mode: "insensitive"}});
    }
    if (kind) {
        andFilters.push({kind});
    }
    if (onlyAvailable) {
        andFilters.push({remainingStock: {gt: 0}});
    }
    if (andFilters.length) {
        where.AND = andFilters;
    }

    const [rewards, total] = await Promise.all([
        prisma.reward.findMany({
            where,
            orderBy: [{remainingStock: "desc"}, {title: "asc"}],
            skip,
            take: limit,
            include: {address: true},
        }),
        prisma.reward.count({where}),
    ]);

    const rewardTranslations = await loadRewardTranslations(
        rewards.map((reward) => reward.id),
        lang,
    );

    const items = rewards.map((reward) => {
        const visible = isRewardVisible(reward, now);
        let reason = "OK";
        if (!visible) {
            reason = "INACTIVE";
        } else if (reward.remainingStock <= 0) {
            reason = "OUT_OF_STOCK";
        } else if (user.diamonds < reward.costDiamonds) {
            reason = "NOT_ENOUGH_DIAMONDS";
        }

        const localized = applyRewardTranslations(reward, rewardTranslations);

        return {
            id: reward.id,
            code: reward.code,
            title: localized.title,
            description: localized.description,
            kind: reward.kind,
            city: reward.city,
            imageUrl: reward.imageUrl,
            costDiamonds: reward.costDiamonds,
            remainingStock: reward.remainingStock,
            fulfillmentMode: reward.fulfillmentMode,
            redeemMethod: reward.redeemMethod,
            address: formatAddress(reward.address),
            user: {
                canBuy: reason === "OK",
                reason,
            },
        };
    });

    return {
        items,
        page,
        limit,
        total,
    };
};

export const getRewardDetails = async (userId: string, rewardId: string, lang: string = "en") => {
    await ensureUser(userId);
    const now = new Date();
    const reward = await prisma.reward.findFirst({
        where: {
            id: rewardId,
            ...buildVisibilityFilter(now),
        },
        include: {address: true},
    });

    if (!reward) {
        throw new ServiceError("Récompense introuvable ou inactive.", 404, MURYA_ERROR.REWARD_NOT_FOUND);
    }

    const rewardTranslations = await loadRewardTranslations([reward.id], lang);
    const localized = applyRewardTranslations(reward, rewardTranslations);

    return {
        id: reward.id,
        code: reward.code,
        title: localized.title,
        description: localized.description,
        kind: reward.kind,
        city: reward.city,
        imageUrl: reward.imageUrl,
        costDiamonds: reward.costDiamonds,
        remainingStock: reward.remainingStock,
        fulfillmentMode: reward.fulfillmentMode,
        redeemMethod: reward.redeemMethod,
        redeemInstructions: localized.redeemInstructions,
        address: formatAddress(reward.address),
    };
};

export const purchaseReward = async (
    userId: string,
    rewardId: string,
    quantity: number,
    idempotencyKey: string,
    lang: string = "en",
) => {
    if (!idempotencyKey) {
        throw new ServiceError("Idempotency-Key manquant.", 400, MURYA_ERROR.IDEMPOTENCY_REQUIRED);
    }

    const now = new Date();
    try {
        const result = await prisma.$transaction(async (tx) => {
            const existing = await tx.rewardPurchase.findUnique({
                where: {userId_idempotencyKey: {userId, idempotencyKey}},
                include: {reward: {select: {id: true, title: true}}},
            });

            if (existing) {
                const user = await tx.user.findUnique({
                    where: {id: userId},
                    select: {diamonds: true},
                });
                return {
                    purchase: formatPurchaseResponse(existing),
                    wallet: {diamonds: user?.diamonds ?? 0},
                    idempotent: true,
                    external: false,
                };
            }

            const reward = await tx.reward.findUnique({
                where: {id: rewardId},
                select: {
                    id: true,
                    title: true,
                    costDiamonds: true,
                    remainingStock: true,
                    isActive: true,
                    visibleFrom: true,
                    visibleTo: true,
                    fulfillmentMode: true,
                    providerKey: true,
                    externalProductId: true,
                },
            });

            if (!reward) {
                throw new ServiceError("Récompense introuvable.", 404, MURYA_ERROR.REWARD_NOT_FOUND);
            }

            if (!isRewardVisible(reward as Reward, now)) {
                throw new ServiceError("Récompense inactive.", 400, MURYA_ERROR.REWARD_NOT_ACTIVE);
            }

            const user = await tx.user.findUnique({
                where: {id: userId},
                select: {id: true, diamonds: true},
            });
            if (!user) {
                throw new ServiceError("Utilisateur introuvable.", 404, MURYA_ERROR.USER_NOT_FOUND);
            }

            const totalCost = reward.costDiamonds * quantity;
            if (user.diamonds < totalCost) {
                throw new ServiceError("Diamants insuffisants.", 409, MURYA_ERROR.NOT_ENOUGH_DIAMONDS);
            }

            if (reward.remainingStock < quantity) {
                throw new ServiceError("Stock insuffisant.", 409, MURYA_ERROR.OUT_OF_STOCK);
            }

            const stockUpdate = await tx.reward.updateMany({
                where: {id: rewardId, remainingStock: {gte: quantity}},
                data: {remainingStock: {decrement: quantity}},
            });

            if (stockUpdate.count === 0) {
                throw new ServiceError("Stock insuffisant.", 409, MURYA_ERROR.OUT_OF_STOCK);
            }

            const isLocal = reward.fulfillmentMode === RewardFulfillmentMode.LOCAL;
            const voucherCode = isLocal ? generateVoucherCode() : null;
            const status = isLocal ? RewardPurchaseStatus.READY : RewardPurchaseStatus.FULFILLING;

            const purchase = await tx.rewardPurchase.create({
                data: {
                    userId,
                    rewardId,
                    quantity,
                    unitCostDiamonds: reward.costDiamonds,
                    totalCostDiamonds: totalCost,
                    status,
                    idempotencyKey,
                    voucherCode,
                    readyAt: isLocal ? now : null,
                },
                include: {
                    reward: {
                        select: {
                            id: true,
                            title: true,
                            fulfillmentMode: true,
                            providerKey: true,
                            externalProductId: true,
                        },
                    },
                },
            });

            await tx.currencyLedger.create({
                data: {
                    userId,
                    currency: CurrencyType.DIAMONDS,
                    delta: -totalCost,
                    reason: "REWARD_PURCHASE",
                    refType: "RewardPurchase",
                    refId: purchase.id,
                },
            });

            const updatedUser = await tx.user.update({
                where: {id: userId},
                data: {diamonds: {decrement: totalCost}},
                select: {diamonds: true},
            });

            return {
                purchase,
                wallet: {diamonds: updatedUser.diamonds},
                idempotent: false,
                external: purchase.reward?.fulfillmentMode === RewardFulfillmentMode.EXTERNAL,
            };
        });

        if (result.external && result.purchase?.id) {
            queueExternalFulfillment(result.purchase);
        }

        const purchaseResponse = formatPurchaseResponse(result.purchase);
        if (purchaseResponse.reward?.id) {
            const rewardTranslations = await loadRewardTranslations(
                [purchaseResponse.reward.id],
                lang,
            );
            purchaseResponse.reward.title = resolveTranslationValue(
                rewardTranslations,
                purchaseResponse.reward.id,
                "title",
                purchaseResponse.reward.title,
            ) as string;
        }

        return {
            purchase: purchaseResponse,
            wallet: result.wallet,
            idempotent: result.idempotent,
        };
    } catch (err: any) {
        if (err?.code === "P2002") {
            const existing = await prisma.rewardPurchase.findUnique({
                where: {userId_idempotencyKey: {userId, idempotencyKey}},
                include: {reward: {select: {id: true, title: true}}},
            });
            if (existing) {
                const user = await prisma.user.findUnique({
                    where: {id: userId},
                    select: {diamonds: true},
                });
                const purchaseResponse = formatPurchaseResponse(existing);
                if (purchaseResponse.reward?.id) {
                    const rewardTranslations = await loadRewardTranslations(
                        [purchaseResponse.reward.id],
                        lang,
                    );
                    purchaseResponse.reward.title = resolveTranslationValue(
                        rewardTranslations,
                        purchaseResponse.reward.id,
                        "title",
                        purchaseResponse.reward.title,
                    ) as string;
                }
                return {
                    purchase: purchaseResponse,
                    wallet: {diamonds: user?.diamonds ?? 0},
                    idempotent: true,
                };
            }
        }
        throw err;
    }
};

const queueExternalFulfillment = (purchase: any) => {
    const reward = purchase.reward;
    if (!reward?.providerKey) {
        console.warn("External fulfillment skipped: missing providerKey", {
            purchaseId: purchase.id,
        });
        return;
    }
    console.log("Queue external reward fulfillment", {
        purchaseId: purchase.id,
        providerKey: reward.providerKey,
        externalProductId: reward.externalProductId,
    });
};

export const listUserPurchases = async (
    userId: string,
    {page = 1, limit = 20, lang = "en"}: {page?: number; limit?: number; lang?: string} = {},
) => {
    await ensureUser(userId);
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
        prisma.rewardPurchase.findMany({
            where: {userId},
            orderBy: {purchasedAt: "desc"},
            skip,
            take: limit,
            include: {
                reward: {
                    select: {
                        id: true,
                        title: true,
                        imageUrl: true,
                        city: true,
                        kind: true,
                    },
                },
            },
        }),
        prisma.rewardPurchase.count({where: {userId}}),
    ]);

    const rewardTranslations = await loadRewardTranslations(
        items.map((item) => item.reward?.id).filter((id): id is string => Boolean(id)),
        lang,
    );

    return {
        items: items.map((item) => ({
            ...item,
            reward: item.reward
                ? {
                    ...item.reward,
                    title: resolveTranslationValue(
                        rewardTranslations,
                        item.reward.id,
                        "title",
                        item.reward.title,
                    ) as string,
                }
                : null,
        })),
        page,
        limit,
        total,
    };
};

export const getUserPurchaseDetails = async (
    userId: string,
    purchaseId: string,
    lang: string = "en",
) => {
    await ensureUser(userId);
    const purchase = await prisma.rewardPurchase.findFirst({
        where: {id: purchaseId, userId},
        include: {
            reward: {
                include: {address: true},
            },
        },
    });

    if (!purchase) {
        throw new ServiceError("Achat introuvable.", 404, MURYA_ERROR.PURCHASE_NOT_FOUND);
    }

    const rewardTranslations = purchase.reward
        ? await loadRewardTranslations([purchase.reward.id], lang)
        : new Map<string, string>();

    return {
        id: purchase.id,
        status: purchase.status,
        totalCostDiamonds: purchase.totalCostDiamonds,
        voucherCode: purchase.voucherCode,
        voucherQrPayload: purchase.voucherQrPayload,
        voucherLink: purchase.voucherLink,
        purchasedAt: purchase.purchasedAt,
        readyAt: purchase.readyAt,
        reward: purchase.reward
            ? {
                id: purchase.reward.id,
                title: resolveTranslationValue(
                    rewardTranslations,
                    purchase.reward.id,
                    "title",
                    purchase.reward.title,
                ),
                redeemInstructions: resolveTranslationValue(
                    rewardTranslations,
                    purchase.reward.id,
                    "redeemInstructions",
                    purchase.reward.redeemInstructions,
                ),
                redeemMethod: purchase.reward.redeemMethod,
                address: formatAddress(purchase.reward.address),
            }
            : null,
    };
};

export const getWallet = async (userId: string, limit = 20) => {
    const user = await ensureUser(userId);
    const ledger = await prisma.currencyLedger.findMany({
        where: {userId, currency: CurrencyType.DIAMONDS},
        orderBy: {createdAt: "desc"},
        take: limit,
    });

    return {
        diamonds: user.diamonds,
        ledger,
    };
};

export const createReward = async (data: any, lang?: string) => {
    if (!data?.code || !data?.title) {
        throw new ServiceError("Les champs code et title sont requis.", 400, MURYA_ERROR.INVALID_PAYLOAD);
    }

    const reward = await prisma.reward.create({
        data: {
            code: data.code,
            title: data.title,
            description: data.description ?? null,
            kind: data.kind ?? RewardKind.OTHER,
            city: data.city ?? "",
            imageUrl: data.imageUrl ?? "",
            addressId: data.addressId ?? null,
            costDiamonds: data.costDiamonds ?? 0,
            totalStock: data.totalStock ?? null,
            remainingStock: data.remainingStock ?? 0,
            isActive: data.isActive ?? true,
            visibleFrom: data.visibleFrom ?? null,
            visibleTo: data.visibleTo ?? null,
            fulfillmentMode: data.fulfillmentMode ?? RewardFulfillmentMode.LOCAL,
            providerKey: data.providerKey ?? null,
            externalProductId: data.externalProductId ?? null,
            redeemMethod: data.redeemMethod ?? undefined,
            redeemInstructions: data.redeemInstructions ?? null,
            meta: data.meta ?? undefined,
        },
    });
    return localizeReward(reward, lang);
};

export const updateReward = async (rewardId: string, data: any, lang?: string) => {
    const reward = await prisma.reward.update({
        where: {id: rewardId},
        data,
    });
    return localizeReward(reward, lang);
};

export const adjustRewardStock = async (rewardId: string, delta: number, lang?: string) => {
    const reward = await prisma.reward.update({
        where: {id: rewardId},
        data: {remainingStock: {increment: delta}},
    });
    return localizeReward(reward, lang);
};

export const markPurchaseReady = async (
    purchaseId: string,
    data: {voucherCode?: string | null; voucherLink?: string | null},
    lang?: string,
) => {
    const purchase = await prisma.rewardPurchase.update({
        where: {id: purchaseId},
        data: {
            status: RewardPurchaseStatus.READY,
            voucherCode: data.voucherCode ?? undefined,
            voucherLink: data.voucherLink ?? undefined,
            readyAt: new Date(),
        },
        include: {
            reward: {select: {id: true, title: true}},
        },
    });

    const reward = purchase.reward
        ? await localizeReward(purchase.reward, lang)
        : null;

    return {
        purchase: {
            ...purchase,
            reward,
        },
    };
};

export const refundPurchase = async (purchaseId: string) => {
    return prisma.$transaction(async (tx) => {
        const purchase = await tx.rewardPurchase.findUnique({
            where: {id: purchaseId},
        });
        if (!purchase) {
            throw new ServiceError("Achat introuvable.", 404, MURYA_ERROR.PURCHASE_NOT_FOUND);
        }
        if (purchase.status === RewardPurchaseStatus.REFUNDED) {
            throw new ServiceError("Achat déjà remboursé.", 409, MURYA_ERROR.ALREADY_REFUNDED);
        }

        const updated = await tx.rewardPurchase.update({
            where: {id: purchaseId},
            data: {
                status: RewardPurchaseStatus.REFUNDED,
                cancelledAt: new Date(),
            },
        });

        await tx.currencyLedger.create({
            data: {
                userId: purchase.userId,
                currency: CurrencyType.DIAMONDS,
                delta: purchase.totalCostDiamonds,
                reason: "REWARD_REFUND",
                refType: "RewardPurchase",
                refId: purchase.id,
            },
        });

        const wallet = await tx.user.update({
            where: {id: purchase.userId},
            data: {diamonds: {increment: purchase.totalCostDiamonds}},
            select: {diamonds: true},
        });

        return {purchase: updated, wallet};
    });
};
