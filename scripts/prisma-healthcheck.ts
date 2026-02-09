import {PrismaClient} from '@prisma/client';

const prisma = new PrismaClient();

const hasArg = (flag: string) => process.argv.includes(flag);
const verbose = hasArg('--verbose');

type Step = {
    name: string;
    run: () => Promise<unknown>;
};

const steps: Step[] = [
    {
        name: 'ping',
        run: async () => {
            return prisma.$queryRaw`SELECT 1`;
        },
    },
    {
        name: 'translation.count',
        run: async () => prisma.translation.count(),
    },
    {
        name: 'jobKiviat.count',
        run: async () => prisma.jobKiviat.count(),
    },
    {
        name: 'jobKiviat.levels',
        run: async () => {
            const rows = await prisma.$queryRaw<
                Array<{level: string; count: number}>
            >`SELECT level, COUNT(*)::int AS count FROM "JobKiviat" GROUP BY level ORDER BY level`;
            const expected = ['BEGINNER', 'JUNIOR', 'MIDLEVEL', 'SENIOR'];
            const found = new Map(rows.map((row) => [row.level, row.count]));
            const missing = expected.filter((level) => !found.get(level));
            if (missing.length) {
                throw new Error(`JobKiviat missing levels: ${missing.join(', ')}`);
            }
            return rows;
        },
    },
    {
        name: 'userJob.count',
        run: async () => prisma.userJob.count(),
    },
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectWithRetry(attempts = 3, delayMs = 1000) {
    let lastError: unknown = null;
    for (let i = 1; i <= attempts; i += 1) {
        try {
            await prisma.$connect();
            return;
        } catch (error) {
            lastError = error;
            if (i < attempts) {
                await sleep(delayMs);
            }
        }
    }
    throw lastError;
}

async function main() {
    let failed = 0;

    try {
        await connectWithRetry();
    } catch (error) {
        console.error('[fail] connect');
        console.error(error);
        process.exit(1);
    }

    for (const step of steps) {
        const startedAt = Date.now();
        try {
            const result = await step.run();
            const durationMs = Date.now() - startedAt;
            if (verbose) {
                console.log(`[ok] ${step.name} (${durationMs}ms) ->`, result);
            } else {
                console.log(`[ok] ${step.name} (${durationMs}ms)`);
            }
        } catch (error) {
            failed += 1;
            const durationMs = Date.now() - startedAt;
            console.error(`[fail] ${step.name} (${durationMs}ms)`);
            console.error(error);
        }
    }

    if (failed > 0) {
        process.exit(1);
    }
}

if (require.main === module) {
    main()
        .catch((err) => {
            console.error(err);
            process.exit(1);
        })
        .finally(async () => {
            await prisma.$disconnect();
        });
}
