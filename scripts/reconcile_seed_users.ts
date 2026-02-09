/* eslint-disable no-console */
import {CurrencyType, UserJobScope, UserJobStatus, UserQuizStatus} from '@prisma/client';
import {prisma} from '../src/config/db';
import {trackEvent} from '../src/services/quests.services';

const DEFAULT_EMAILS = [
    'sebastien.biney@murya.app',
    'jonathan.dahissiho@murya.app',
    'arnaud.lissajoux@murya.app',
];

const parseTimezone = () => {
    const arg = process.argv.find((value) => value.startsWith('--timezone='));
    if (!arg) return 'Europe/Paris';
    const [, raw] = arg.split('=');
    return raw || 'Europe/Paris';
};

const parseEmails = () => {
    const args = process.argv.slice(2).filter((value) => !value.startsWith('--'));
    return args.length ? args : DEFAULT_EMAILS;
};

const sum = (values: Array<number | null | undefined>) =>
    values.reduce<number>((acc, value) => acc + (value ?? 0), 0);

const hasArg = (flag: string) => process.argv.includes(flag);
const verbose = hasArg('--verbose');

const computeUserDiamonds = async (userId: string) => {
    const ledgerAgg = await prisma.currencyLedger.aggregate({
        where: {userId, currency: CurrencyType.DIAMONDS},
        _sum: {delta: true},
    });
    const ledgerDelta = ledgerAgg._sum.delta ?? 0;
    return {diamonds: ledgerDelta, ledgerDelta};
};

const backfillQuizLedger = async (userId: string) => {
    const quizzes = await prisma.userQuiz.findMany({
        where: {
            status: UserQuizStatus.COMPLETED,
            userJob: {userId},
        },
        select: {
            id: true,
            totalScore: true,
            bonusPoints: true,
            completedAt: true,
        },
    });

    const entries = quizzes
        .map((quiz) => ({
            userId,
            currency: CurrencyType.DIAMONDS,
            delta: (quiz.totalScore ?? 0) + (quiz.bonusPoints ?? 0),
            reason: 'QUIZ_COMPLETED',
            refType: 'UserQuiz',
            refId: quiz.id,
            createdAt: quiz.completedAt ?? new Date(),
        }))
        .filter((entry) => entry.delta !== 0);

    if (!entries.length) {
        return 0;
    }

    const result = await prisma.currencyLedger.createMany({
        data: entries,
        skipDuplicates: true,
    });

    return result.count;
};

const recomputeUserJobStats = async (userJobId: string) => {
    const userJob = await prisma.userJob.findUnique({
        where: {id: userJobId},
        select: {
            id: true,
            scope: true,
            selectedJobs: {where: {isSelected: true}, select: {jobId: true}},
        },
    });
    if (!userJob) return;

    const selectedJobIds = new Set(userJob.selectedJobs.map((selection) => selection.jobId));

    const quizzes = await prisma.userQuiz.findMany({
        where: {userJobId},
        select: {
            status: true,
            totalScore: true,
            bonusPoints: true,
            maxScoreWithBonus: true,
            completedAt: true,
            jobsSnapshot: true,
        },
    });

    const filtered = userJob.scope === UserJobScope.JOB_FAMILY
        ? quizzes.filter((quiz) => {
            const snapshot = Array.isArray(quiz.jobsSnapshot) ? quiz.jobsSnapshot : [];
            if (!snapshot.length) return true;
            return snapshot.some((jobId: unknown) => selectedJobIds.has(String(jobId)));
        })
        : quizzes;

    const completed = filtered.filter((quiz) => quiz.status === UserQuizStatus.COMPLETED);
    const totalScore = sum(filtered.map((quiz) => (quiz.totalScore ?? 0) + (quiz.bonusPoints ?? 0)));
    const maxScoreSum = sum(filtered.map((quiz) => quiz.maxScoreWithBonus ?? 0));
    const completedQuizzes = completed.length;
    const lastQuizAt = completed.reduce<Date | null>((latest, quiz) => {
        if (!quiz.completedAt) return latest;
        if (!latest || quiz.completedAt > latest) return quiz.completedAt;
        return latest;
    }, null);

    await prisma.userJob.update({
        where: {id: userJobId},
        data: {
            completedQuizzes,
            totalScore,
            maxScoreSum,
            lastQuizAt,
            status: UserJobStatus.CURRENT,
        },
    });
};

const rebuildUserJobQuests = async (userJobId: string, userId: string, timezone: string) => {
    const quizzes = await prisma.userQuiz.findMany({
        where: {userJobId, status: UserQuizStatus.COMPLETED},
        select: {
            quizId: true,
            type: true,
            index: true,
            completedAt: true,
            percentage: true,
        },
        orderBy: {completedAt: 'asc'},
    });

    for (const quiz of quizzes) {
        await trackEvent(
            userJobId,
            'QUIZ_COMPLETED',
            {
                quizType: quiz.type,
                quizId: quiz.quizId,
                quizIndex: quiz.index + 1,
                score: quiz.percentage ?? 0,
                completedAt: quiz.completedAt ?? undefined,
            },
            timezone,
            userId,
        );
    }
};

async function main() {
    const emails = parseEmails();
    const timezone = parseTimezone();

    console.log(`[reconcile] users=${emails.join(', ')} timezone=${timezone}`);

    for (const email of emails) {
        const user = await prisma.user.findUnique({
            where: {email},
            select: {id: true, email: true, diamonds: true},
        });
        if (!user) {
            console.warn(`[reconcile] skip ${email} (not found)`);
            continue;
        }

        const userJobs = await prisma.userJob.findMany({
            where: {userId: user.id},
            select: {id: true},
        });
        const userJobIds = userJobs.map((job) => job.id);

        const ledgerInserted = await backfillQuizLedger(user.id);

        await prisma.userJobQuest.deleteMany({
            where: {
                userJobId: {in: userJobIds},
                questDefinition: {eventKey: 'QUIZ_COMPLETED'},
            },
        });
        await prisma.userQuestGroup.deleteMany({
            where: {userJobId: {in: userJobIds}},
        });

        for (const job of userJobs) {
            await recomputeUserJobStats(job.id);
            await rebuildUserJobQuests(job.id, user.id, timezone);
        }

        const diamondResult = await computeUserDiamonds(user.id);
        await prisma.user.update({
            where: {id: user.id},
            data: {diamonds: diamondResult.diamonds},
        });

        console.log(`[reconcile] ${email} diamonds ${user.diamonds} -> ${diamondResult.diamonds}`);
        if (verbose) {
            console.log(`[reconcile] ${email} ledgerDelta=${diamondResult.ledgerDelta} quizLedgerInserted=${ledgerInserted}`);
        }
    }
}

main()
    .catch((err) => {
        console.error('[reconcile] failed', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
