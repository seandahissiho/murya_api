import {popArticleGenerationJob} from '../config/redis';
import {generateMarkdownArticleForLastQuiz} from './generateMarkdownArticleForLastQuiz';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const startArticleGenerationWorker = () => {
    const loop = async () => {
        while (true) {
            try {
                const job = await popArticleGenerationJob(5);
                if (!job) {
                    continue;
                }
                await generateMarkdownArticleForLastQuiz(job.userJobId, job.userId);
            } catch (err) {
                console.error('Article generation worker error', err);
                await sleep(1000);
            }
        }
    };

    loop().catch((err) => {
        console.error('Article generation worker fatal error', err);
    });
};
