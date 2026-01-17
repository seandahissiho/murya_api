import {randomUUID} from 'crypto';
import {Response} from 'express';
import {RealtimeEnvelope, SseWriteInput} from './realtime.types';

export const MAX_SSE_DATA_BYTES = 16 * 1024;

export const createEventId = (): string => randomUUID();

export const buildEnvelope = <T>(
    userId: string,
    type: string,
    payload: T,
): RealtimeEnvelope<T> => ({
    type,
    ts: new Date().toISOString(),
    userId,
    payload,
});

export const writeSse = (res: Response, {id, event, data}: SseWriteInput): boolean => {
    const dataSize = Buffer.byteLength(data, 'utf8');
    if (dataSize > MAX_SSE_DATA_BYTES) {
        console.warn(`[realtime] payload too large (${dataSize} bytes) for event ${event}`);
        return false;
    }

    let chunk = '';
    if (event) {
        chunk += `event: ${event}\n`;
    }
    if (id) {
        chunk += `id: ${id}\n`;
    }
    chunk += `data: ${data}\n\n`;

    try {
        return res.write(chunk);
    } catch (err) {
        console.warn('[realtime] failed to write SSE chunk', err);
        return false;
    }
};

export const sendEnvelope = <T>(
    res: Response,
    userId: string,
    eventType: string,
    payload: T,
    eventId?: string,
): boolean => {
    const envelope = buildEnvelope(userId, eventType, payload);
    const data = JSON.stringify(envelope);
    const id = eventId ?? createEventId();
    return writeSse(res, {id, event: eventType, data});
};
