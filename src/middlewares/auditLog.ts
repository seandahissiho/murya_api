import {NextFunction, Request, Response} from 'express';
import {createAuditLog} from '../services/audit_logs.services';

const MUTATIVE_METHODS = new Set(['POST', 'PATCH', 'DELETE', 'PUT']);

const hasKeys = (value: Record<string, unknown> | null | undefined) =>
    !!value && Object.keys(value).length > 0;

export const auditLogMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();

    res.on('finish', () => {
        const method = req.method.toUpperCase();
        if (!MUTATIVE_METHODS.has(method)) {
            return;
        }

        const user = (req as any)?.user;
        const actorUserId = typeof user?.userId === 'string' ? user.userId : null;
        const actorRoleId = typeof user?.userRole === 'string' ? user.userRole : null;
        const isAdmin = typeof user?.isAdmin === 'boolean' ? user.isAdmin : null;

        const baseUrl = req.baseUrl ?? '';
        const routePath = req.route?.path;
        const route = routePath ? `${baseUrl}${routePath}` : null;
        const path = `${baseUrl}${req.path}`;

        const params = hasKeys(req.params as Record<string, unknown>) ? req.params : undefined;
        const query = hasKeys(req.query as Record<string, unknown>) ? req.query : undefined;

        void createAuditLog({
            actorUserId,
            actorRoleId,
            isAdmin,
            method,
            path,
            route,
            statusCode: res.statusCode,
            durationMs: Date.now() - startedAt,
            ip: req.ip ?? null,
            userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
            params,
            query,
        }).catch((err) => {
            console.error('auditLog error:', err);
        });
    });

    next();
};
