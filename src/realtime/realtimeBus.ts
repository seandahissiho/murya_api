import {Response} from 'express';
import {RealtimeEventType} from './realtime.types';
import {createEventId, sendEnvelope} from './sse.helpers';

export type RealtimeConnection = {
    id: string;
    res: Response;
    createdAt: string;
};

const connections = new Map<string, Map<string, RealtimeConnection>>();

const getUserConnections = (userId: string) => {
    const existing = connections.get(userId);
    if (existing) return existing;
    const created = new Map<string, RealtimeConnection>();
    connections.set(userId, created);
    return created;
};

const isConnectionClosed = (res: Response) => res.writableEnded || res.destroyed;

const broadcastToUser = (userId: string, eventType: RealtimeEventType, payload: unknown) => {
    const userConnections = connections.get(userId);
    if (!userConnections || userConnections.size === 0) return;

    const eventId = createEventId();
    for (const connection of userConnections.values()) {
        if (isConnectionClosed(connection.res)) {
            removeConnection(userId, connection.id);
            continue;
        }
        const ok = sendEnvelope(connection.res, userId, eventType, payload, eventId);
        if (!ok && isConnectionClosed(connection.res)) {
            removeConnection(userId, connection.id);
        }
    }
};

const addConnection = (userId: string, res: Response): RealtimeConnection => {
    const userConnections = getUserConnections(userId);
    const connectionId = createEventId();
    const connection = {id: connectionId, res, createdAt: new Date().toISOString()};
    userConnections.set(connectionId, connection);
    console.log(`[realtime] connect user=${userId} connection=${connectionId}`);
    return connection;
};

const removeConnection = (userId: string, connectionId: string) => {
    const userConnections = connections.get(userId);
    if (!userConnections) return;
    userConnections.delete(connectionId);
    if (userConnections.size === 0) {
        connections.delete(userId);
    }
    console.log(`[realtime] disconnect user=${userId} connection=${connectionId}`);
};

const publishToUser = (userId: string, eventType: RealtimeEventType, payload: unknown) => {
    console.log(`[realtime] event ${eventType} -> user=${userId}`);
    broadcastToUser(userId, eventType, payload);
};

export const realtimeBus = {
    addConnection,
    removeConnection,
    publishToUser,
};
