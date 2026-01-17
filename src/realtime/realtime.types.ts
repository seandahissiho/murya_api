export type RealtimeEventType =
    | 'progress.updated'
    | 'content.available'
    | 'notification.created'
    | 'ready'
    | 'ping'
    | string;

export type RealtimeEnvelope<T = unknown> = {
    type: string;
    ts: string;
    userId: string;
    payload: T;
};

export type SseWriteInput = {
    id?: string;
    event: string;
    data: string;
};
