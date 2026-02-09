import {popAuditLogJob} from '../config/redis';
import {persistAuditLog} from './audit_logs.services';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const startAuditLogWorker = () => {
    const loop = async () => {
        while (true) {
            try {
                const job = await popAuditLogJob(5);
                if (!job) {
                    continue;
                }
                await persistAuditLog(job.data as any);
            } catch (err) {
                console.error('Audit log worker error', err);
                await sleep(1000);
            }
        }
    };

    loop().catch((err) => {
        console.error('Audit log worker fatal error', err);
    });
};
