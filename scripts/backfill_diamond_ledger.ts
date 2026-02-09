/* eslint-disable no-console */
import {CurrencyType, UserQuizStatus} from '@prisma/client';
import {prisma} from '../src/config/db';

const parseBatchSize = () => {
    const arg = process.argv.find((value) => value.startsWith('--batch='));
    if (!arg) return 500;
    const [, raw] = arg.split('=');
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 500;
};

const batchSize = parseBatchSize();

async function main() {
    console.log(`[backfill] start batchSize=${batchSize}`);

    let cursor: string | undefined;
    let totalInserted = 0;
    let totalQuizzes = 0;

    while (true) {
        const quizzes = await prisma.userQuiz.findMany({
            where: {status: UserQuizStatus.COMPLETED},
            select: {
                id: true,
                totalScore: true,
                bonusPoints: true,
                completedAt: true,
                userJob: {select: {userId: true}},
            },
            orderBy: {id: 'asc'},
            take: batchSize,
            ...(cursor ? {skip: 1, cursor: {id: cursor}} : {}),
        });

        if (!quizzes.length) {
            break;
        }

        totalQuizzes += quizzes.length;

        const entries = quizzes
            .map((quiz) => {
                const userId = quiz.userJob?.userId;
                const delta = (quiz.totalScore ?? 0) + (quiz.bonusPoints ?? 0);
                if (!userId || delta === 0) {
                    return null;
                }
                return {
                    userId,
                    currency: CurrencyType.DIAMONDS,
                    delta,
                    reason: 'QUIZ_COMPLETED',
                    refType: 'UserQuiz',
                    refId: quiz.id,
                    createdAt: quiz.completedAt ?? new Date(),
                };
            })
            .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

        let inserted = 0;
        if (entries.length) {
            const result = await prisma.currencyLedger.createMany({
                data: entries,
                skipDuplicates: true,
            });
            inserted = result.count;
            totalInserted += inserted;
        }

        cursor = quizzes[quizzes.length - 1].id;
        console.log(`[backfill] batch quizzes=${quizzes.length} inserted=${inserted} totalInserted=${totalInserted}`);
    }

    console.log(`[backfill] totalQuizzes=${totalQuizzes} ledgerInserted=${totalInserted}`);

    await prisma.$executeRaw`
        UPDATE "User" u
        SET diamonds = COALESCE(
            (
                SELECT SUM(cl."delta")
                FROM "CurrencyLedger" cl
                WHERE cl."userId" = u.id
                  AND cl.currency = ${CurrencyType.DIAMONDS}::"CurrencyType"
            ),
            0
        );
    `;

    console.log('[backfill] diamonds cache synced');
}

main()
    .catch((err) => {
        console.error('[backfill] failed', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
