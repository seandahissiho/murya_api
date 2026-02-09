/* eslint-disable no-console */
import {CurrencyType, UserJobScope, UserQuizStatus} from '@prisma/client';
import {prisma} from '../src/config/db';

const parseArgValue = (prefix: string) => {
    const arg = process.argv.find((value) => value.startsWith(prefix));
    if (!arg) return null;
    const [, raw] = arg.split('=');
    return raw || null;
};

const hasArg = (flag: string) => process.argv.includes(flag);

const sum = (values: Array<number | null | undefined>) =>
    values.reduce<number>((acc, value) => acc + (value ?? 0), 0);

const resolveUser = async () => {
    const userId = parseArgValue('--userId=');
    const email = parseArgValue('--email=');
    if (!userId && !email) {
        throw new Error('Provide --userId=<uuid> or --email=<email>.');
    }

    if (userId) {
        return prisma.user.findUnique({
            where: {id: userId},
            select: {id: true, email: true, diamonds: true},
        });
    }

    return prisma.user.findUnique({
        where: {email: email!},
        select: {id: true, email: true, diamonds: true},
    });
};

const computeUserJobTotals = async (userJobId: string) => {
    const userJob = await prisma.userJob.findUnique({
        where: {id: userJobId},
        select: {
            id: true,
            scope: true,
            jobId: true,
            jobFamilyId: true,
            totalScore: true,
            completedQuizzes: true,
            selectedJobs: {where: {isSelected: true}, select: {jobId: true}},
        },
    });
    if (!userJob) return null;

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

    const completedFiltered = filtered.filter((quiz) => quiz.status === UserQuizStatus.COMPLETED);
    const totalFiltered = sum(filtered.map((quiz) => (quiz.totalScore ?? 0) + (quiz.bonusPoints ?? 0)));
    const completedCount = completedFiltered.length;

    const completedAll = quizzes.filter((quiz) => quiz.status === UserQuizStatus.COMPLETED);
    const totalAll = sum(quizzes.map((quiz) => (quiz.totalScore ?? 0) + (quiz.bonusPoints ?? 0)));

    return {
        userJob,
        totals: {
            filtered: {totalScore: totalFiltered, completedQuizzes: completedCount},
            all: {totalScore: totalAll, completedQuizzes: completedAll.length},
        },
    };
};

async function main() {
    const verbose = hasArg('--verbose');
    const user = await resolveUser();
    if (!user) {
        throw new Error('User not found.');
    }

    console.log(`[check] user=${user.email ?? user.id} id=${user.id}`);

    const [ledgerAgg, ledgerByReason, quizAgg] = await Promise.all([
        prisma.currencyLedger.aggregate({
            where: {userId: user.id, currency: CurrencyType.DIAMONDS},
            _sum: {delta: true},
        }),
        prisma.currencyLedger.groupBy({
            by: ['reason'],
            where: {userId: user.id, currency: CurrencyType.DIAMONDS},
            _sum: {delta: true},
            orderBy: {_sum: {delta: 'desc'}},
        }),
        prisma.userQuiz.aggregate({
            where: {status: UserQuizStatus.COMPLETED, userJob: {userId: user.id}},
            _sum: {totalScore: true, bonusPoints: true},
        }),
    ]);

    const ledgerTotal = ledgerAgg._sum.delta ?? 0;
    const quizTotal = (quizAgg._sum.totalScore ?? 0) + (quizAgg._sum.bonusPoints ?? 0);

    console.log(`[check] cache.diamonds=${user.diamonds} ledger=${ledgerTotal} diff=${ledgerTotal - user.diamonds}`);
    console.log(`[check] quizTotal(all userJobs)=${quizTotal}`);

    if (ledgerByReason.length) {
        console.log('[check] ledger by reason');
        for (const row of ledgerByReason) {
            const delta = row._sum.delta ?? 0;
            console.log(`- ${row.reason}: ${delta}`);
        }
    }

    const userJobs = await prisma.userJob.findMany({
        where: {userId: user.id},
        select: {id: true},
    });

    console.log(`[check] userJobs=${userJobs.length}`);

    for (const job of userJobs) {
        const result = await computeUserJobTotals(job.id);
        if (!result) continue;
        const {userJob, totals} = result;
        console.log(`[check] userJob=${userJob.id} scope=${userJob.scope} jobId=${userJob.jobId ?? 'null'} jobFamilyId=${userJob.jobFamilyId ?? 'null'}`);
        console.log(`- stored totalScore=${userJob.totalScore} completedQuizzes=${userJob.completedQuizzes}`);
        console.log(`- recomputed filtered totalScore=${totals.filtered.totalScore} completedQuizzes=${totals.filtered.completedQuizzes}`);
        if (verbose) {
            console.log(`- recomputed all totalScore=${totals.all.totalScore} completedQuizzes=${totals.all.completedQuizzes}`);
        }
    }
}

main()
    .catch((err) => {
        console.error('[check] failed', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
