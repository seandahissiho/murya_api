import {Prisma} from '@prisma/client';
import {prisma} from '../config/db';
import {enqueueAuditLogJob} from '../config/redis';

export type AuditLogCreateInput = Prisma.AuditLogUncheckedCreateInput;

export const persistAuditLog = async (data: AuditLogCreateInput) => {
    return prisma.auditLog.create({data});
};

export const createAuditLog = async (data: AuditLogCreateInput) => {
    const enqueued = await enqueueAuditLogJob({data});
    if (!enqueued) {
        console.warn('Audit log not enqueued (worker-only mode).');
    }
    return enqueued;
};
