import {CurrencyType, Prisma, PrismaClient} from "@prisma/client";
import {prisma} from "../config/db";

export type LedgerTx = Prisma.TransactionClient | PrismaClient;

export type DiamondsLedgerEntry = {
    userId: string;
    delta: number;
    reason: string;
    refType: string;
    refId: string;
    createdAt?: Date;
};

export const getDiamondsBalance = async (tx: LedgerTx, userId: string) => {
    const result = await tx.currencyLedger.aggregate({
        where: {userId, currency: CurrencyType.DIAMONDS},
        _sum: {delta: true},
    });
    return result._sum.delta ?? 0;
};

export const syncUserDiamondsCache = async (tx: LedgerTx, userId: string) => {
    const balance = await getDiamondsBalance(tx, userId);
    await tx.user.update({
        where: {id: userId},
        data: {diamonds: balance},
    });
    return balance;
};

export const applyDiamondsLedgerDelta = async (
    tx: LedgerTx,
    {userId, delta, reason, refType, refId, createdAt}: DiamondsLedgerEntry,
) => {
    if (delta === 0) {
        return getDiamondsBalance(tx, userId);
    }

    await tx.currencyLedger.create({
        data: {
            userId,
            currency: CurrencyType.DIAMONDS,
            delta,
            reason,
            refType,
            refId,
            createdAt: createdAt ?? undefined,
        },
    });

    const updated = await tx.user.update({
        where: {id: userId},
        data: delta >= 0
            ? {diamonds: {increment: delta}}
            : {diamonds: {decrement: Math.abs(delta)}},
        select: {diamonds: true},
    });

    return updated.diamonds;
};
