import {Prisma} from '@prisma/client';
import {prisma} from '../config/db';

export type AuditLogCreateInput = Prisma.AuditLogUncheckedCreateInput;

export const createAuditLog = async (data: AuditLogCreateInput) => {
    return prisma.auditLog.create({data});
};
