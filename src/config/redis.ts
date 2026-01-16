import type {RedisClientType} from 'redis';
import {createClient} from 'redis';

export type QuizGenerationJob = {
    userId: string;
    jobId?: string | null;
    userJobId: string;
};

export type ArticleGenerationJob = {
    userId: string;
    userJobId: string;
};

const QUIZ_GENERATION_QUEUE = 'queue:quiz_generation';
const ARTICLE_GENERATION_QUEUE = 'queue:article_generation';

let client: RedisClientType | null = null;

export const initRedis = async () => {
    if (!process.env.REDIS_URL) {
        console.log('Redis non configuré (REDIS_URL manquant), désactivation des tâches en arrière-plan.');
        return null;
    }

    if (client) {
        return client;
    }

    client = createClient({url: process.env.REDIS_URL});
    client.on('error', (err) => console.error('Redis error', err));

    await client.connect();
    console.log('Redis connecté');
    return client;
};

export const getRedisClient = () => client;

export const enqueueQuizGenerationJob = async (job: QuizGenerationJob): Promise<boolean> => {
    if (!client) return false;
    await client.lPush(QUIZ_GENERATION_QUEUE, JSON.stringify(job));
    return true;
};

export const popQuizGenerationJob = async (timeoutSeconds = 5): Promise<QuizGenerationJob | null> => {
    if (!client) return null;
    const result = await client.brPop(QUIZ_GENERATION_QUEUE, timeoutSeconds);
    if (!result) return null;
    try {
        return JSON.parse(result.element) as QuizGenerationJob;
    } catch (err) {
        console.error('Invalid quiz generation job payload', err);
        return null;
    }
};

export const enqueueArticleGenerationJob = async (job: ArticleGenerationJob): Promise<boolean> => {
    if (!client) return false;
    await client.lPush(ARTICLE_GENERATION_QUEUE, JSON.stringify(job));
    return true;
};

export const popArticleGenerationJob = async (timeoutSeconds = 5): Promise<ArticleGenerationJob | null> => {
    if (!client) return null;
    const result = await client.brPop(ARTICLE_GENERATION_QUEUE, timeoutSeconds);
    if (!result) return null;
    try {
        return JSON.parse(result.element) as ArticleGenerationJob;
    } catch (err) {
        console.error('Invalid article generation job payload', err);
        return null;
    }
};
