import {
    CurrencyType,
    Prisma,
    QuestDefinition,
    QuestCategory,
    QuestPeriod,
    QuestStatus,
    QuizType,
    StreakType,
    UserJobStatus,
    UserQuizStatus,
} from '@prisma/client';
import {DateTime} from 'luxon';
import {prisma} from '../config/db';

const DEFAULT_TIMEZONE = 'UTC';
const WEEKLY_MAIN_CODE = 'WEEKLY_MAIN_5_DAILY_QUIZZES';

type QuestDefinitionWithRewards = Prisma.QuestDefinitionGetPayload<{
    include: {rewards: true};
}>;

type QuestLockState = {
    locked: boolean;
    reason?: string;
};

export type QuestEventPayload = {
    quizType?: QuizType | string;
    score?: number;
    completedAt?: string | Date;
    resourceId?: string;
    referredUserId?: string;
};

const normalizeTimezone = (timezone?: string): string => {
    if (!timezone || typeof timezone !== 'string') {
        return DEFAULT_TIMEZONE;
    }
    const trimmed = timezone.trim();
    if (!trimmed) {
        return DEFAULT_TIMEZONE;
    }
    const probe = DateTime.now().setZone(trimmed);
    return probe.isValid ? trimmed : DEFAULT_TIMEZONE;
};

const resolveEventDate = (payload?: QuestEventPayload): Date => {
    if (!payload?.completedAt) {
        return new Date();
    }
    const raw = payload.completedAt;
    const date = raw instanceof Date ? raw : new Date(raw);
    return Number.isNaN(date.getTime()) ? new Date() : date;
};

const toMetaObject = (meta: unknown): Record<string, unknown> | null => {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
        return null;
    }
    return meta as Record<string, unknown>;
};

const matchesQuestMeta = (meta: Record<string, unknown> | null, payload: QuestEventPayload): boolean => {
    if (!meta) {
        return true;
    }

    const quizType = typeof meta.quizType === 'string' ? meta.quizType : undefined;
    if (quizType) {
        if (!payload.quizType || payload.quizType !== quizType) {
            return false;
        }
    }

    const minScore = typeof meta.minScore === 'number' ? meta.minScore : undefined;
    if (minScore !== undefined) {
        if (payload.score === undefined || payload.score < minScore) {
            return false;
        }
    }

    return true;
};

const getRequiredQuestCode = (meta: Record<string, unknown> | null) => {
    if (!meta || typeof meta.requiresQuestCode !== 'string') {
        return null;
    }
    return meta.requiresQuestCode.trim() || null;
};

const getRequiredStatuses = (meta: Record<string, unknown> | null): QuestStatus[] | null => {
    if (!meta || !Array.isArray(meta.requiresQuestStatusIn)) {
        return null;
    }
    const statusSet = new Set(Object.values(QuestStatus));
    const filtered = meta.requiresQuestStatusIn.filter(
        (status): status is QuestStatus =>
            typeof status === 'string' && statusSet.has(status as QuestStatus),
    );
    return filtered.length > 0 ? filtered : null;
};

const getRequiredMinProgress = (meta: Record<string, unknown> | null): number | null => {
    if (!meta || typeof meta.requiresMinProgress !== 'number') {
        return null;
    }
    return meta.requiresMinProgress;
};

const ensureQuestInstance = async (
    userJobId: string,
    definition: QuestDefinitionWithRewards,
    periodStartAt: Date,
    periodEndAt: Date,
) => {
    return prisma.userJobQuest.upsert({
        where: {
            userJobId_questDefinitionId_periodStartAt: {
                userJobId,
                questDefinitionId: definition.id,
                periodStartAt,
            },
        },
        update: {periodEndAt},
        create: {
            userJobId,
            questDefinitionId: definition.id,
            periodStartAt,
            periodEndAt,
            progressCount: 0,
            status: QuestStatus.ACTIVE,
        },
    });
};

const isQuestLocked = async (
    userJobId: string,
    questDefinition: QuestDefinition | QuestDefinitionWithRewards,
    periodStartAt: Date,
    timezone: string,
): Promise<QuestLockState> => {
    const meta = toMetaObject(questDefinition.meta);
    const requiredCode = getRequiredQuestCode(meta);
    if (!requiredCode) {
        return {locked: false};
    }

    const requiredDefinition = await prisma.questDefinition.findUnique({
        where: {code: requiredCode},
        include: {rewards: true},
    });

    if (!requiredDefinition) {
        return {locked: true, reason: 'requiredQuestNotFound'};
    }

    const {periodStartAt: requiredStart} = getQuestWindow(
        requiredDefinition.period,
        timezone,
        periodStartAt,
    );

    const requiredQuest = await prisma.userJobQuest.findFirst({
        where: {
            userJobId,
            questDefinitionId: requiredDefinition.id,
            periodStartAt: requiredStart,
        },
    });

    if (!requiredQuest) {
        return {locked: true, reason: 'requiredQuestMissing'};
    }

    const requiredStatuses = getRequiredStatuses(meta);
    if (requiredStatuses && !requiredStatuses.includes(requiredQuest.status)) {
        return {locked: true, reason: 'requiredQuestStatus'};
    }

    const requiredMinProgress = getRequiredMinProgress(meta);
    if (
        requiredMinProgress !== null &&
        requiredQuest.progressCount < requiredMinProgress
    ) {
        return {locked: true, reason: 'requiredQuestProgress'};
    }

    return {locked: false};
};

export const getQuestWindow = (
    period: QuestPeriod,
    timezone: string,
    referenceDate?: Date | string,
) => {
    const zone = normalizeTimezone(timezone);
    const baseDate = referenceDate
        ? referenceDate instanceof Date
            ? referenceDate
            : new Date(referenceDate)
        : new Date();
    const base = DateTime.fromJSDate(baseDate, {zone});

    let start: DateTime;
    let end: DateTime;

    switch (period) {
        case QuestPeriod.DAILY:
            start = base.startOf('day');
            end = base.endOf('day');
            break;
        case QuestPeriod.WEEKLY: {
            const weekStart = base.setLocale('en-GB').startOf('week');
            start = weekStart.startOf('day');
            end = weekStart.plus({days: 6}).endOf('day');
            break;
        }
        case QuestPeriod.MONTHLY:
            start = base.startOf('month');
            end = base.endOf('month');
            break;
        default:
            start = base.startOf('day');
            end = base.endOf('day');
            break;
    }

    return {
        periodStartAt: start.toJSDate(),
        periodEndAt: end.toJSDate(),
    };
};

export const syncWeeklyMainQuest = async (
    userJobId: string,
    timezone?: string,
    referenceDate?: Date | string,
) => {
    const questDefinition = await prisma.questDefinition.findUnique({
        where: {code: WEEKLY_MAIN_CODE},
    });

    if (!questDefinition || !questDefinition.isActive) {
        return null;
    }

    const zone = normalizeTimezone(timezone);
    const {periodStartAt, periodEndAt} = getQuestWindow(
        QuestPeriod.WEEKLY,
        zone,
        referenceDate,
    );

    const quizzes = await prisma.userQuiz.findMany({
        where: {
            userJobId,
            type: QuizType.DAILY,
            status: UserQuizStatus.COMPLETED,
            completedAt: {
                gte: periodStartAt,
                lte: periodEndAt,
            },
        },
        select: {completedAt: true},
    });

    const weekdayDates = new Set<string>();
    let weekendQuizCount = 0;

    for (const quiz of quizzes) {
        if (!quiz.completedAt) {
            continue;
        }
        const localDate = DateTime.fromJSDate(quiz.completedAt, {zone});
        const weekday = localDate.weekday;
        if (weekday >= 1 && weekday <= 5) {
            weekdayDates.add(localDate.toISODate() ?? '');
        } else {
            weekendQuizCount += 1;
        }
    }

    const meta = toMetaObject(questDefinition.meta);
    const weekendCap = typeof meta?.weekendCatchupCap === 'number'
        ? meta.weekendCatchupCap
        : 2;

    const weekdayDistinctDays = weekdayDates.size;
    const remainingSlots = Math.max(0, questDefinition.targetCount - weekdayDistinctDays);
    const weekendProgress = Math.min(weekendQuizCount, weekendCap, remainingSlots);
    const effectiveProgress = weekdayDistinctDays + weekendProgress;
    const progressCount = Math.min(effectiveProgress, questDefinition.targetCount);
    const isCompleted = progressCount >= questDefinition.targetCount;
    const now = new Date();

    const existing = await prisma.userJobQuest.findUnique({
        where: {
            userJobId_questDefinitionId_periodStartAt: {
                userJobId,
                questDefinitionId: questDefinition.id,
                periodStartAt,
            },
        },
    });

    if (!existing) {
        return prisma.userJobQuest.create({
            data: {
                userJobId,
                questDefinitionId: questDefinition.id,
                periodStartAt,
                periodEndAt,
                progressCount,
                status: isCompleted ? QuestStatus.COMPLETED : QuestStatus.ACTIVE,
                completedAt: isCompleted ? now : null,
            },
        });
    }

    if (existing.status === QuestStatus.CLAIMED) {
        return existing;
    }

    return prisma.userJobQuest.update({
        where: {id: existing.id},
        data: {
            periodEndAt,
            progressCount,
            status: isCompleted ? QuestStatus.COMPLETED : QuestStatus.ACTIVE,
            completedAt: isCompleted ? existing.completedAt ?? now : null,
        },
    });
};

export const trackEvent = async (
    userJobId: string,
    eventKey: string,
    payload: QuestEventPayload,
    timezone?: string,
) => {
    const definitions = await prisma.questDefinition.findMany({
        where: {
            eventKey,
            isActive: true,
        },
    });

    if (definitions.length === 0) {
        return;
    }

    const zone = normalizeTimezone(timezone);
    const eventDate = resolveEventDate(payload);

    for (const definition of definitions) {
        const meta = toMetaObject(definition.meta);
        if (!matchesQuestMeta(meta, payload)) {
            continue;
        }

        const isWeeklyMain = meta?.weeklyMain === true || definition.code === WEEKLY_MAIN_CODE;
        if (isWeeklyMain) {
            await syncWeeklyMainQuest(userJobId, zone, eventDate);
            continue;
        }

        const {periodStartAt, periodEndAt} = getQuestWindow(
            definition.period,
            zone,
            eventDate,
        );

        const lockState = await isQuestLocked(userJobId, definition, periodStartAt, zone);
        if (lockState.locked) {
            continue;
        }

        await prisma.$transaction(async (tx) => {
            const existing = await tx.userJobQuest.findUnique({
                where: {
                    userJobId_questDefinitionId_periodStartAt: {
                        userJobId,
                        questDefinitionId: definition.id,
                        periodStartAt,
                    },
                },
            });

            if (!existing) {
                const initialProgress = Math.min(1, definition.targetCount);
                const isCompleted = initialProgress >= definition.targetCount;
                await tx.userJobQuest.create({
                    data: {
                        userJobId,
                        questDefinitionId: definition.id,
                        periodStartAt,
                        periodEndAt,
                        progressCount: initialProgress,
                        status: isCompleted ? QuestStatus.COMPLETED : QuestStatus.ACTIVE,
                        completedAt: isCompleted ? new Date() : null,
                    },
                });
                return;
            }

            if (existing.status === QuestStatus.CLAIMED) {
                return;
            }

            const nextProgress = Math.min(
                existing.progressCount + 1,
                definition.targetCount,
            );
            const isCompleted = nextProgress >= definition.targetCount;

            await tx.userJobQuest.update({
                where: {id: existing.id},
                data: {
                    periodEndAt,
                    progressCount: nextProgress,
                    status: isCompleted ? QuestStatus.COMPLETED : QuestStatus.ACTIVE,
                    completedAt: isCompleted ? existing.completedAt ?? new Date() : null,
                },
            });
        });
    }
};

export const listUserQuests = async (
    userId: string,
    timezone?: string,
    userJobId?: string,
) => {
    const userJob = userJobId
        ? await prisma.userJob.findFirst({
            where: {id: userJobId, userId},
            select: {id: true},
        })
        : await prisma.userJob.findFirst({
            where: {userId, status: UserJobStatus.CURRENT},
            select: {id: true},
        });

    if (!userJob) {
        throw new Error('Job utilisateur actuel introuvable.');
    }

    const definitions = await prisma.questDefinition.findMany({
        where: {isActive: true},
        include: {rewards: true},
        orderBy: {uiOrder: 'asc'},
    });

    const zone = normalizeTimezone(timezone);
    const questItems: Array<{
        definition: QuestDefinitionWithRewards;
        instance: any;
    }> = [];

    for (const definition of definitions) {
        const {periodStartAt, periodEndAt} = getQuestWindow(definition.period, zone);
        const instance = await ensureQuestInstance(
            userJob.id,
            definition,
            periodStartAt,
            periodEndAt,
        );

        questItems.push({definition, instance});
    }

    const mainQuest = questItems.find(
        (item) => item.definition.category === QuestCategory.MAIN,
    );

    if (mainQuest) {
        const synced = await syncWeeklyMainQuest(userJob.id, zone);
        if (synced) {
            mainQuest.instance = synced;
        }
    }

    const mainId = mainQuest?.definition.id;
    const branches = mainId
        ? questItems.filter((item) => item.definition.parentId === mainId)
        : [];
    const others = questItems.filter((item) => {
        if (mainId && item.definition.parentId === mainId) {
            return false;
        }
        if (item.definition.category === QuestCategory.MAIN) {
            return false;
        }
        return true;
    });

    const decorate = async (item: {definition: QuestDefinitionWithRewards; instance: any}) => {
        const lockState = await isQuestLocked(
            userJob.id,
            item.definition,
            item.instance.periodStartAt,
            zone,
        );
        const claimable = !lockState.locked
            && item.instance.status === QuestStatus.COMPLETED
            && !item.instance.claimedAt;

        return {
            definition: item.definition,
            instance: item.instance,
            rewards: item.definition.rewards,
            locked: lockState.locked,
            lockedReason: lockState.locked ? lockState.reason ?? null : null,
            claimable,
        };
    };

    return {
        userJobId: userJob.id,
        main: mainQuest ? await decorate(mainQuest) : null,
        branches: await Promise.all(branches.map(decorate)),
        others: await Promise.all(others.map(decorate)),
    };
};

export const claimUserJobQuest = async (
    userId: string,
    userJobQuestId: string,
    timezone?: string,
) => {
    const zone = normalizeTimezone(timezone);
    return prisma.$transaction(async (tx) => {
        const quest = await tx.userJobQuest.findUnique({
            where: {id: userJobQuestId},
            include: {
                questDefinition: {include: {rewards: true}},
                userJob: {select: {id: true, userId: true}},
            },
        });

        if (!quest) {
            throw new Error('Quête introuvable.');
        }

        if (quest.userJob.userId !== userId) {
            throw new Error('Accès refusé.');
        }

        const lockState = await isQuestLocked(
            quest.userJob.id,
            quest.questDefinition as QuestDefinitionWithRewards,
            quest.periodStartAt,
            zone,
        );
        if (lockState.locked) {
            throw new Error('Quête verrouillée.');
        }

        if (quest.status !== QuestStatus.COMPLETED || quest.claimedAt) {
            throw new Error('Récompense déjà réclamée ou quête non complétée.');
        }

        const totals = new Map<CurrencyType, number>();
        for (const reward of quest.questDefinition.rewards) {
            totals.set(reward.currency, (totals.get(reward.currency) ?? 0) + reward.amount);
        }

        for (const [currency, amount] of totals) {
            if (amount === 0) {
                continue;
            }

            await tx.currencyLedger.create({
                data: {
                    userId: quest.userJob.userId,
                    currency,
                    delta: amount,
                    reason: 'QUEST_REWARD',
                    refType: 'UserJobQuest',
                    refId: quest.id,
                },
            });

            if (currency === CurrencyType.DIAMONDS) {
                await tx.user.update({
                    where: {id: quest.userJob.userId},
                    data: {diamonds: {increment: amount}},
                });
            }

            if (currency === CurrencyType.LEAGUE_POINTS) {
                await tx.userJob.update({
                    where: {id: quest.userJob.id},
                    data: {leaguePoints: {increment: amount}},
                });
            }
        }

        return tx.userJobQuest.update({
            where: {id: quest.id},
            data: {
                status: QuestStatus.CLAIMED,
                claimedAt: new Date(),
            },
        });
    });
};

export const updateLoginStreak = async (userId: string, timezone?: string) => {
    const zone = normalizeTimezone(timezone);
    const today = DateTime.now().setZone(zone);
    const todayKey = today.toISODate() ?? '';
    const yesterdayKey = today.minus({days: 1}).toISODate() ?? '';

    const existing = await prisma.userStreak.findUnique({
        where: {userId_type: {userId, type: StreakType.LOGIN_DAILY}},
    });

    if (!existing) {
        return prisma.userStreak.create({
            data: {
                userId,
                type: StreakType.LOGIN_DAILY,
                currentDays: 1,
                bestDays: 1,
                lastActiveDay: todayKey,
                streakStartDay: todayKey,
            },
        });
    }

    if (existing.lastActiveDay === todayKey) {
        return existing;
    }

    const continued = existing.lastActiveDay === yesterdayKey;
    const currentDays = continued ? existing.currentDays + 1 : 1;
    const bestDays = Math.max(existing.bestDays, currentDays);

    return prisma.userStreak.update({
        where: {id: existing.id},
        data: {
            currentDays,
            bestDays,
            lastActiveDay: todayKey,
            streakStartDay: continued ? existing.streakStartDay : todayKey,
        },
    });
};
