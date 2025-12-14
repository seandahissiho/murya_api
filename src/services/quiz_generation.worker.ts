import {popQuizGenerationJob} from '../config/redis';
import {generateAndPersistDailyQuiz} from './user_jobs.services';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const startQuizGenerationWorker = () => {
    const loop = async () => {
        while (true) {
            try {
                const job = await popQuizGenerationJob(5);
                if (!job) {
                    continue;
                }
                await generateAndPersistDailyQuiz(job.userId, job.jobId, job.userJobId);
            } catch (err) {
                console.error('Quiz generation worker error', err);
                await sleep(1000);
            }
        }
    };

    loop().catch((err) => {
        console.error('Quiz generation worker fatal error', err);
    });
};
