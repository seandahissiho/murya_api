import {Request, Response} from 'express';
import {realtimeBus} from './realtimeBus';
import {sendEnvelope} from './sse.helpers';
import {MURYA_ERROR} from '../constants/errorCodes';

const HEARTBEAT_MS = 25_000;

export const streamRealtime = (req: Request, res: Response) => {
    const userId = (req as any).user?.userId;
    if (!userId) {
        res.status(401).json({code: MURYA_ERROR.AUTH_REQUIRED});
        return;
    }

    const lastEventId = req.header('Last-Event-ID');
    if (lastEventId) {
        console.log(`[realtime] Last-Event-ID from user=${userId}: ${lastEventId}`);
    }

    const origin = req.headers.origin as string | undefined;
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Last-Event-ID, Content-Type');

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Content-Encoding', 'identity');

    res.flushHeaders?.();

    const connection = realtimeBus.addConnection(userId, res);

    sendEnvelope(res, userId, 'ready', {message: 'stream ready'});
    sendEnvelope(res, userId, 'ping', {heartbeat: true});

    const heartbeat = setInterval(() => {
        const ok = sendEnvelope(res, userId, 'ping', {heartbeat: true});
        if (!ok && (res.writableEnded || res.destroyed)) {
            clearInterval(heartbeat);
            realtimeBus.removeConnection(userId, connection.id);
        }
    }, HEARTBEAT_MS);

    req.on('close', () => {
        clearInterval(heartbeat);
        realtimeBus.removeConnection(userId, connection.id);
    });
};
