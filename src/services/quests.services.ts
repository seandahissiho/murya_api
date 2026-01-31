import {
    CurrencyType,
    Prisma,
    QuestDefinition,
    QuestCategory,
    QuestPeriod,
    QuestScope,
    QuestStatus,
    QuizType,
    StreakType,
    UserJobStatus,
    UserQuizStatus,
} from '@prisma/client';
import {DateTime} from 'luxon';
import {prisma} from '../config/db';
import {getTranslationsMap} from '../i18n/translate';

const DEFAULT_TIMEZONE = 'UTC';
const WEEKLY_MAIN_CODE = 'WEEKLY_MAIN_5_DAILY_QUIZZES';
const POSITIONING_QUEST_CODE = 'POSITIONING_COMPLETE_QUIZZES';

type QuestDefinitionWithRewards = Prisma.QuestDefinitionGetPayload<{
    include: {rewards: true};
}>;

type QuestLockState = {
    locked: boolean;
    reason?: string;
};

export type QuestEventPayload = {
    quizType?: QuizType | string;
    quizId?: string;
    quizIndex?: number;
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

const isOneShotQuest = (meta: Record<string, unknown> | null): boolean => {
    return meta?.oneShot === true;
};

const parseMetaDate = (
    meta: Record<string, unknown> | null,
    key: 'activeFrom' | 'activeTo',
    zone: string,
): DateTime | null => {
    if (!meta || typeof meta[key] !== 'string') {
        return null;
    }
    const parsed = DateTime.fromISO(meta[key] as string, {zone});
    return parsed.isValid ? parsed : null;
};

const isQuestActiveForDate = (
    meta: Record<string, unknown> | null,
    zone: string,
    date: Date,
): boolean => {
    if (!meta) {
        return true;
    }
    const target = DateTime.fromJSDate(date, {zone});
    const activeFrom = parseMetaDate(meta, 'activeFrom', zone);
    if (activeFrom && target < activeFrom.startOf('day')) {
        return false;
    }
    const activeTo = parseMetaDate(meta, 'activeTo', zone);
    if (activeTo && target > activeTo.endOf('day')) {
        return false;
    }
    return true;
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

    const quizId = typeof meta.quizId === 'string' ? meta.quizId : undefined;
    if (quizId) {
        if (!payload.quizId || payload.quizId !== quizId) {
            return false;
        }
    }

    const quizIndex = typeof meta.quizIndex === 'number' ? meta.quizIndex : undefined;
    if (quizIndex !== undefined) {
        if (payload.quizIndex === undefined || payload.quizIndex !== quizIndex) {
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

const getDefaultRequiredStatuses = (): QuestStatus[] => [
    QuestStatus.COMPLETED,
    QuestStatus.CLAIMED,
];

const getPositioningTargetCount = async (userJobId: string): Promise<number | null> => {
    const userJob = await prisma.userJob.findUnique({
        where: {id: userJobId},
        select: {scope: true, jobId: true, jobFamilyId: true},
    });

    if (!userJob) {
        return null;
    }

    if (userJob.scope === 'JOB' && userJob.jobId) {
        return prisma.quiz.count({
            where: {
                jobId: userJob.jobId,
                type: QuizType.POSITIONING,
                isActive: true,
            },
        });
    }

    if (userJob.scope === 'JOB_FAMILY' && userJob.jobFamilyId) {
        return prisma.quiz.count({
            where: {
                jobFamilyId: userJob.jobFamilyId,
                type: QuizType.POSITIONING,
                isActive: true,
            },
        });
    }

    return null;
};

const isQuestCompletedStatus = (status: QuestStatus) =>
    status === QuestStatus.COMPLETED || status === QuestStatus.CLAIMED;

const isQuestGroupCompleted = (
    requiredTotal: number,
    requiredCompleted: number,
    optionalTotal: number,
    optionalCompleted: number,
) => {
    if (requiredTotal > 0) {
        return requiredCompleted >= requiredTotal;
    }
    if (optionalTotal > 0) {
        return optionalCompleted >= optionalTotal;
    }
    return false;
};

const getPositioningQuestCodes = async (): Promise<string[]> => {
    const definitions = await prisma.questDefinition.findMany({
        where: {
            isActive: true,
            eventKey: 'QUIZ_COMPLETED',
            scope: QuestScope.USER_JOB,
            meta: {
                path: ['quizType'],
                equals: 'POSITIONING',
            },
        },
        select: {code: true, meta: true},
    });

    return definitions
        .filter((def) => {
            const meta = toMetaObject(def.meta);
            return typeof meta?.quizIndex === 'number';
        })
        .map((def) => def.code);
};

const resolveQuestGroupWindow = (
    group: {period: QuestPeriod; meta: unknown; scope: QuestScope},
    timezone: string,
    userCreatedAt: Date,
    userJobCreatedAt?: Date | null,
) => {
    const meta = toMetaObject(group.meta);
    const referenceDate = isOneShotQuest(meta)
        ? group.scope === QuestScope.USER_JOB
            ? userJobCreatedAt ?? userCreatedAt
            : userCreatedAt
        : undefined;
    return getQuestWindow(group.period, timezone, referenceDate);
};

const upsertUserQuestGroup = async (
    userId: string,
    userJobId: string | null,
    questGroupId: string,
    periodStartAt: Date,
    periodEndAt: Date,
    requiredTotal: number,
    requiredCompleted: number,
    optionalTotal: number,
    optionalCompleted: number,
) => {
    const existing = await prisma.userQuestGroup.findFirst({
        where: {
            userId,
            userJobId,
            questGroupId,
            periodStartAt,
        },
    });

    const completed = isQuestGroupCompleted(
        requiredTotal,
        requiredCompleted,
        optionalTotal,
        optionalCompleted,
    );
    const status = completed ? QuestStatus.COMPLETED : QuestStatus.ACTIVE;
    const completedAt = completed ? existing?.completedAt ?? new Date() : null;

    if (!existing) {
        return prisma.userQuestGroup.create({
            data: {
                userId,
                userJobId: userJobId ?? null,
                questGroupId,
                status,
                requiredTotal,
                requiredCompleted,
                optionalTotal,
                optionalCompleted,
                periodStartAt,
                periodEndAt,
                completedAt,
            },
        });
    }

    return prisma.userQuestGroup.update({
        where: {id: existing.id},
        data: {
            status,
            requiredTotal,
            requiredCompleted,
            optionalTotal,
            optionalCompleted,
            periodEndAt,
            completedAt,
        },
    });
};

const resolveQuestTargetCount = async (
    questDefinition: QuestDefinition | QuestDefinitionWithRewards,
    userJobId: string | null,
) => {
    if (questDefinition.code !== POSITIONING_QUEST_CODE) {
        return questDefinition.targetCount;
    }

    if (!userJobId) {
        return questDefinition.targetCount;
    }

    const count = await getPositioningTargetCount(userJobId);
    return count && count > 0 ? count : questDefinition.targetCount;
};

const ensureQuestInstance = async (
    userJobId: string,
    definition: QuestDefinition | QuestDefinitionWithRewards,
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

const ensureUserQuestInstance = async (
    userId: string,
    definition: QuestDefinition | QuestDefinitionWithRewards,
    periodStartAt: Date,
    periodEndAt: Date,
) => {
    return prisma.userQuest.upsert({
        where: {
            userId_questDefinitionId_periodStartAt: {
                userId,
                questDefinitionId: definition.id,
                periodStartAt,
            },
        },
        update: {periodEndAt},
        create: {
            userId,
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
    userId?: string,
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

    const requiredQuest = requiredDefinition.scope === QuestScope.USER
        ? userId
            ? await prisma.userQuest.findFirst({
                where: {
                    userId,
                    questDefinitionId: requiredDefinition.id,
                    periodStartAt: requiredStart,
                },
            })
            : null
        : await prisma.userJobQuest.findFirst({
            where: {
                userJobId,
                questDefinitionId: requiredDefinition.id,
                periodStartAt: requiredStart,
            },
        });

    if (!requiredQuest) {
        return {locked: true, reason: 'requiredQuestMissing'};
    }

    const requiredStatuses = getRequiredStatuses(meta) ?? getDefaultRequiredStatuses();
    if (requiredStatuses.length > 0 && !requiredStatuses.includes(requiredQuest.status)) {
        return {locked: true, reason: 'requiredQuestStatus'};
    }

    const requiredMinProgress = getRequiredMinProgress(meta)
        ?? Math.max(1, requiredDefinition.targetCount ?? 1);
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
        case QuestPeriod.ONCE:
            start = base.startOf('day');
            end = DateTime.fromISO('9999-12-31T23:59:59', {zone});
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

export const ensureQuestInstanceForUserJob = async (
    userJobId: string,
    questCode: string,
    timezone?: string,
    referenceDate?: Date | string,
) => {
    const questDefinition = await prisma.questDefinition.findUnique({
        where: {code: questCode},
    });

    if (!questDefinition || !questDefinition.isActive) {
        return null;
    }
    if (questDefinition.scope !== QuestScope.USER_JOB) {
        return null;
    }

    const zone = normalizeTimezone(timezone);
    const {periodStartAt, periodEndAt} = getQuestWindow(
        questDefinition.period,
        zone,
        referenceDate,
    );

    return ensureQuestInstance(userJobId, questDefinition, periodStartAt, periodEndAt);
};

export const ensureQuestInstanceForUser = async (
    userId: string,
    questCode: string,
    timezone?: string,
    referenceDate?: Date | string,
) => {
    const questDefinition = await prisma.questDefinition.findUnique({
        where: {code: questCode},
    });

    if (!questDefinition || !questDefinition.isActive) {
        return null;
    }
    if (questDefinition.scope !== QuestScope.USER) {
        return null;
    }

    const zone = normalizeTimezone(timezone);
    const {periodStartAt, periodEndAt} = getQuestWindow(
        questDefinition.period,
        zone,
        referenceDate,
    );

    return ensureUserQuestInstance(userId, questDefinition, periodStartAt, periodEndAt);
};

export const assignPositioningQuestsForUserJob = async (
    userJobId: string,
    timezone?: string,
    referenceDate?: Date | string,
) => {
    const userJob = await prisma.userJob.findUnique({
        where: {id: userJobId},
        select: {createdAt: true},
    });
    if (!userJob) {
        return;
    }

    const availableCount = await getPositioningTargetCount(userJobId);
    const codes = await getPositioningQuestCodes();
    const createdAt = referenceDate ?? userJob.createdAt;

    for (const code of codes) {
        const definition = await prisma.questDefinition.findUnique({
            where: {code},
            select: {meta: true},
        });
        const meta = toMetaObject(definition?.meta);
        const quizIndex = typeof meta?.quizIndex === 'number' ? meta.quizIndex : null;
        if (availableCount !== null && quizIndex !== null && quizIndex > availableCount) {
            continue;
        }
        await ensureQuestInstanceForUserJob(userJobId, code, timezone, createdAt);
    }
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
    userJobId: string | null,
    eventKey: string,
    payload: QuestEventPayload,
    timezone?: string,
    userId?: string,
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
    const hasOneShotUserJob = definitions.some((definition) =>
        definition.scope === QuestScope.USER_JOB && isOneShotQuest(toMetaObject(definition.meta)),
    );
    const hasOneShotUser = definitions.some((definition) =>
        definition.scope === QuestScope.USER && isOneShotQuest(toMetaObject(definition.meta)),
    );
    const needsUser = definitions.some((definition) => definition.scope === QuestScope.USER);

    const userJob = userJobId
        ? await prisma.userJob.findUnique({
            where: {id: userJobId},
            select: {createdAt: true, userId: true},
        })
        : null;
    const resolvedUserId = userId ?? userJob?.userId ?? null;
    const user = hasOneShotUser && resolvedUserId
        ? await prisma.user.findUnique({
            where: {id: resolvedUserId},
            select: {createdAt: true},
        })
        : null;

    const touchedDefinitionIds: string[] = [];

    for (const definition of definitions) {
        if (definition.scope === QuestScope.USER && !resolvedUserId) {
            if (needsUser) {
                continue;
            }
        }
        if (definition.scope === QuestScope.USER_JOB && !userJobId) {
            continue;
        }
        const meta = toMetaObject(definition.meta);
        if (!isQuestActiveForDate(meta, zone, eventDate)) {
            continue;
        }
        const requiredWeekday = typeof meta?.weekday === 'number' ? meta.weekday : null;
        if (requiredWeekday !== null) {
            const eventWeekday = DateTime.fromJSDate(eventDate, {zone}).weekday;
            if (eventWeekday !== requiredWeekday) {
                continue;
            }
        }
        if (!matchesQuestMeta(meta, payload)) {
            continue;
        }

        const isWeeklyMain = meta?.weeklyMain === true || definition.code === WEEKLY_MAIN_CODE;
        if (isWeeklyMain && userJobId) {
            await syncWeeklyMainQuest(userJobId, zone, eventDate);
            continue;
        }

        const {periodStartAt, periodEndAt} = getQuestWindow(
            definition.period,
            zone,
            isOneShotQuest(meta)
                ? definition.scope === QuestScope.USER
                    ? user?.createdAt ?? eventDate
                    : userJob?.createdAt ?? eventDate
                : eventDate,
        );

        const lockState = await isQuestLocked(
            userJobId ?? '',
            definition,
            periodStartAt,
            zone,
            resolvedUserId ?? undefined,
        );
        if (lockState.locked) {
            continue;
        }

        await prisma.$transaction(async (tx) => {
            const targetCount = await resolveQuestTargetCount(definition, userJobId ?? null);
            const existing = definition.scope === QuestScope.USER
                ? await tx.userQuest.findUnique({
                    where: {
                        userId_questDefinitionId_periodStartAt: {
                            userId: resolvedUserId!,
                            questDefinitionId: definition.id,
                            periodStartAt,
                        },
                    },
                })
                : await tx.userJobQuest.findUnique({
                    where: {
                        userJobId_questDefinitionId_periodStartAt: {
                            userJobId: userJobId!,
                            questDefinitionId: definition.id,
                            periodStartAt,
                        },
                    },
                });

            if (!existing) {
                const initialProgress = Math.min(1, targetCount);
                const isCompleted = initialProgress >= targetCount;
                if (definition.scope === QuestScope.USER) {
                    await tx.userQuest.create({
                        data: {
                            userId: resolvedUserId!,
                            questDefinitionId: definition.id,
                            periodStartAt,
                            periodEndAt,
                            progressCount: initialProgress,
                            status: isCompleted ? QuestStatus.COMPLETED : QuestStatus.ACTIVE,
                            completedAt: isCompleted ? new Date() : null,
                        },
                    });
                } else {
                    await tx.userJobQuest.create({
                        data: {
                            userJobId: userJobId!,
                            questDefinitionId: definition.id,
                            periodStartAt,
                            periodEndAt,
                            progressCount: initialProgress,
                            status: isCompleted ? QuestStatus.COMPLETED : QuestStatus.ACTIVE,
                            completedAt: isCompleted ? new Date() : null,
                        },
                    });
                }
                return;
            }

            if (existing.status === QuestStatus.CLAIMED) {
                return;
            }

            const nextProgress = Math.min(
                existing.progressCount + 1,
                targetCount,
            );
            const isCompleted = nextProgress >= targetCount;

            if (definition.scope === QuestScope.USER) {
                await tx.userQuest.update({
                    where: {id: existing.id},
                    data: {
                        periodEndAt,
                        progressCount: nextProgress,
                        status: isCompleted ? QuestStatus.COMPLETED : QuestStatus.ACTIVE,
                        completedAt: isCompleted ? existing.completedAt ?? new Date() : null,
                    },
                });
            } else {
                await tx.userJobQuest.update({
                    where: {id: existing.id},
                    data: {
                        periodEndAt,
                        progressCount: nextProgress,
                        status: isCompleted ? QuestStatus.COMPLETED : QuestStatus.ACTIVE,
                        completedAt: isCompleted ? existing.completedAt ?? new Date() : null,
                    },
                });
            }
        });

        touchedDefinitionIds.push(definition.id);
    }

    if (resolvedUserId && touchedDefinitionIds.length > 0) {
        await syncQuestGroupsForDefinitions(
            touchedDefinitionIds,
            resolvedUserId,
            userJobId,
            zone,
        );
    }
};

const syncQuestGroupsForDefinitions = async (
    questDefinitionIds: string[],
    userId: string,
    userJobId: string | null,
    timezone: string,
) => {
    if (questDefinitionIds.length === 0) {
        return;
    }

    const user = await prisma.user.findUnique({
        where: {id: userId},
        select: {createdAt: true},
    });
    if (!user) {
        return;
    }

    const userJob = userJobId
        ? await prisma.userJob.findUnique({
            where: {id: userJobId},
            select: {createdAt: true},
        })
        : null;

    const availablePositioningCount = userJobId
        ? await getPositioningTargetCount(userJobId)
        : null;

    const questGroups = await prisma.questGroup.findMany({
        where: {
            isActive: true,
            items: {
                some: {questDefinitionId: {in: questDefinitionIds}},
            },
        },
        include: {
            items: {
                include: {
                    questDefinition: true,
                },
                orderBy: {uiOrder: 'asc'},
            },
        },
    });

    for (const group of questGroups) {
        if (group.scope === QuestScope.USER_JOB && !userJobId) {
            continue;
        }

        const {periodStartAt, periodEndAt} = resolveQuestGroupWindow(
            group,
            timezone,
            user.createdAt,
            userJob?.createdAt,
        );

        const resolvedItems: Array<{
            isRequired: boolean;
            status: QuestStatus;
        }> = [];

        for (const item of group.items) {
            const definition = item.questDefinition;
            if (definition.scope === QuestScope.USER_JOB && !userJobId) {
                continue;
            }

            const meta = toMetaObject(definition.meta);
            const quizIndex = typeof meta?.quizIndex === 'number' ? meta.quizIndex : null;
            const quizType = typeof meta?.quizType === 'string' ? meta.quizType : null;
            if (
                definition.scope === QuestScope.USER_JOB
                && quizType === 'POSITIONING'
                && quizIndex !== null
                && availablePositioningCount !== null
                && quizIndex > availablePositioningCount
            ) {
                continue;
            }

            const questReferenceDate = isOneShotQuest(meta)
                ? definition.scope === QuestScope.USER_JOB
                    ? userJob?.createdAt
                    : user.createdAt
                : undefined;
            const {periodStartAt: questStart, periodEndAt: questEnd} = getQuestWindow(
                definition.period,
                timezone,
                questReferenceDate,
            );

            const instance = definition.scope === QuestScope.USER
                ? await ensureUserQuestInstance(
                    userId,
                    definition,
                    questStart,
                    questEnd,
                )
                : await ensureQuestInstance(
                    userJobId!,
                    definition,
                    questStart,
                    questEnd,
                );

            resolvedItems.push({
                isRequired: item.isRequired,
                status: instance.status,
            });
        }

        const requiredItems = resolvedItems.filter((item) => item.isRequired);
        const optionalItems = resolvedItems.filter((item) => !item.isRequired);
        const requiredCompleted = requiredItems.filter((item) =>
            isQuestCompletedStatus(item.status),
        ).length;
        const optionalCompleted = optionalItems.filter((item) =>
            isQuestCompletedStatus(item.status),
        ).length;

        await upsertUserQuestGroup(
            userId,
            group.scope === QuestScope.USER_JOB ? userJobId : null,
            group.id,
            periodStartAt,
            periodEndAt,
            requiredItems.length,
            requiredCompleted,
            optionalItems.length,
            optionalCompleted,
        );
    }
};

export const listUserQuests = async (
    userId: string,
    timezone?: string,
    userJobId?: string,
    scope: QuestScope | 'ALL' = 'ALL',
    lang: string = 'en',
) => {
    const user = await prisma.user.findUnique({
        where: {id: userId},
        select: {id: true, createdAt: true},
    });
    if (!user) {
        throw new Error('Utilisateur introuvable.');
    }

    const scopes = scope === 'ALL'
        ? [QuestScope.USER, QuestScope.USER_JOB]
        : [scope];
    const needsUserJob = scopes.includes(QuestScope.USER_JOB);

    const userJob = needsUserJob
        ? userJobId
            ? await prisma.userJob.findFirst({
                where: {id: userJobId, userId},
                select: {id: true, createdAt: true},
            })
            : await prisma.userJob.findFirst({
                where: {userId, status: UserJobStatus.CURRENT},
                select: {id: true, createdAt: true},
            })
        : null;

    if (needsUserJob && !userJob) {
        throw new Error('Job utilisateur actuel introuvable.');
    }

    const definitions = await prisma.questDefinition.findMany({
        where: {isActive: true, scope: {in: scopes}},
        include: {rewards: true},
        orderBy: {uiOrder: 'asc'},
    });

    const zone = normalizeTimezone(timezone);
    const now = new Date();
    const activeDefinitions = definitions.filter((definition) =>
        isQuestActiveForDate(toMetaObject(definition.meta), zone, now),
    );
    const questItems: Array<{
        definition: QuestDefinitionWithRewards;
        instance: any;
    }> = [];
    const availablePositioningCount = userJob
        ? await getPositioningTargetCount(userJob.id)
        : null;
    const shouldLimitPositioning =
        availablePositioningCount !== null && availablePositioningCount > 0;
    for (const definition of activeDefinitions) {
        const meta = toMetaObject(definition.meta);

        const referenceDate = isOneShotQuest(meta)
            ? definition.scope === QuestScope.USER_JOB
                ? userJob?.createdAt
                : user.createdAt
            : undefined;
        const {periodStartAt, periodEndAt} = getQuestWindow(
            definition.period,
            zone,
            referenceDate,
        );
        const targetCount = await resolveQuestTargetCount(
            definition,
            definition.scope === QuestScope.USER_JOB ? userJob?.id ?? null : null,
        );
        const effectiveDefinition = {
            ...definition,
            targetCount,
        };
        const instance = definition.scope === QuestScope.USER
            ? await ensureUserQuestInstance(
                user.id,
                effectiveDefinition,
                periodStartAt,
                periodEndAt,
            )
            : await ensureQuestInstance(
                userJob!.id,
                effectiveDefinition,
                periodStartAt,
                periodEndAt,
            );

        questItems.push({definition: effectiveDefinition, instance});
    }

    const mainQuest = questItems.find(
        (item) => item.definition.category === QuestCategory.MAIN,
    );

    if (mainQuest && userJob) {
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

    if (lang) {
        const definitionIds = questItems.map((item) => item.definition.id);
        const definitionTranslations = await getTranslationsMap({
            entity: 'QuestDefinition',
            entityIds: definitionIds,
            fields: ['title', 'description'],
            lang,
        });
        for (const item of questItems) {
            item.definition = {
                ...item.definition,
                title:
                    definitionTranslations.get(`${item.definition.id}::title`) ??
                    item.definition.title,
                description:
                    definitionTranslations.get(`${item.definition.id}::description`) ??
                    item.definition.description,
            };
        }
    }

    const decorate = async (item: {definition: QuestDefinitionWithRewards; instance: any}) => {
        const lockState = await isQuestLocked(
            userJob?.id ?? '',
            item.definition,
            item.instance.periodStartAt,
            zone,
            user.id,
        );
        const claimable = !lockState.locked
            && item.instance.status === QuestStatus.COMPLETED
            && !item.instance.claimedAt;

        return {
            definition: item.definition,
            instance: item.instance,
            rewards: item.definition.rewards,
            scope: item.definition.scope,
            locked: lockState.locked,
            lockedReason: lockState.locked ? lockState.reason ?? null : null,
            claimable,
        };
    };

    const decoratedByDefinitionId = new Map<string, Awaited<ReturnType<typeof decorate>>>();
    for (const item of questItems) {
        decoratedByDefinitionId.set(item.definition.id, await decorate(item));
    }

    const questGroups = await prisma.questGroup.findMany({
        where: {
            isActive: true,
            scope: {in: scopes},
        },
        include: {
            items: {
                include: {
                    questDefinition: {include: {rewards: true}},
                },
                orderBy: {uiOrder: 'asc'},
            },
        },
        orderBy: {uiOrder: 'asc'},
    });

    const groupTranslations = lang
        ? await getTranslationsMap({
            entity: 'QuestGroup',
            entityIds: questGroups.map((group) => group.id),
            fields: ['title', 'description'],
            lang,
        })
        : new Map<string, string>();

    const groups = await Promise.all(questGroups.map(async (group) => {
        const items = group.items
            .map((item) => {
                const decorated = decoratedByDefinitionId.get(item.questDefinitionId);
                if (!decorated) {
                    return null;
                }
                const meta = toMetaObject(decorated.definition.meta);
                const quizIndex = typeof meta?.quizIndex === 'number' ? meta.quizIndex : null;
                const quizType = typeof meta?.quizType === 'string' ? meta.quizType : null;
                if (
                    decorated.scope === QuestScope.USER_JOB
                    && quizType === 'POSITIONING'
                    && quizIndex !== null
                    && shouldLimitPositioning
                    && quizIndex > availablePositioningCount!
                ) {
                    return null;
                }
                return {
                    ...decorated,
                    isRequired: item.isRequired,
                    uiOrder: item.uiOrder,
                };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null);

        const requiredItems = items.filter((item) => item.isRequired);
        const optionalItems = items.filter((item) => !item.isRequired);
        const requiredCompleted = requiredItems.filter((item) =>
            isQuestCompletedStatus(item.instance.status),
        ).length;
        const optionalCompleted = optionalItems.filter((item) =>
            isQuestCompletedStatus(item.instance.status),
        ).length;

        const {periodStartAt, periodEndAt} = resolveQuestGroupWindow(
            group,
            zone,
            user.createdAt,
            userJob?.createdAt,
        );
        const groupInstance = await upsertUserQuestGroup(
            user.id,
            group.scope === QuestScope.USER_JOB ? userJob?.id ?? null : null,
            group.id,
            periodStartAt,
            periodEndAt,
            requiredItems.length,
            requiredCompleted,
            optionalItems.length,
            optionalCompleted,
        );

        return {
            group: {
                id: group.id,
                code: group.code,
                title: groupTranslations.get(`${group.id}::title`) ?? group.title,
                description: groupTranslations.get(`${group.id}::description`) ?? group.description,
                uiOrder: group.uiOrder,
                scope: group.scope,
            },
            instance: groupInstance,
            requiredTotal: requiredItems.length,
            requiredCompleted,
            optionalTotal: optionalItems.length,
            optionalCompleted,
            completed: isQuestGroupCompleted(
                requiredItems.length,
                requiredCompleted,
                optionalItems.length,
                optionalCompleted,
            ),
            items,
        };
    }));

    return {
        userJobId: userJob?.id ?? null,
        main: mainQuest ? decoratedByDefinitionId.get(mainQuest.definition.id) ?? null : null,
        mains: questItems
            .filter((item) => item.definition.category === QuestCategory.MAIN)
            .map((item) => decoratedByDefinitionId.get(item.definition.id))
            .filter((item): item is NonNullable<typeof item> => item !== undefined),
        branches: branches
            .map((item) => decoratedByDefinitionId.get(item.definition.id))
            .filter((item): item is NonNullable<typeof item> => item !== undefined),
        others: others
            .map((item) => decoratedByDefinitionId.get(item.definition.id))
            .filter((item): item is NonNullable<typeof item> => item !== undefined),
        groups,
    };
};

export const listUserQuestGroups = async (
    userId: string,
    timezone?: string,
    userJobId?: string,
    scope?: QuestScope | 'ALL',
    lang?: string,
) => {
    const quests = await listUserQuests(userId, timezone, userJobId, scope, lang);
    return {
        userJobId: quests.userJobId,
        groups: quests.groups,
    };
};

export const listUserQuestLineage = async (
    userId: string,
    timezone?: string,
    userJobId?: string,
    scope: QuestScope | 'ALL' = 'ALL',
    lang: string = 'en',
) => {
    const user = await prisma.user.findUnique({
        where: {id: userId},
        select: {id: true, createdAt: true},
    });
    if (!user) {
        throw new Error('Utilisateur introuvable.');
    }

    const scopes = scope === 'ALL'
        ? [QuestScope.USER, QuestScope.USER_JOB]
        : [scope];
    const needsUserJob = scopes.includes(QuestScope.USER_JOB);

    const userJob = needsUserJob
        ? userJobId
            ? await prisma.userJob.findFirst({
                where: {id: userJobId, userId},
                select: {id: true, createdAt: true},
            })
            : await prisma.userJob.findFirst({
                where: {userId, status: UserJobStatus.CURRENT},
                select: {id: true, createdAt: true},
            })
        : null;

    if (needsUserJob && !userJob) {
        throw new Error('Job utilisateur actuel introuvable.');
    }

    const definitions = await prisma.questDefinition.findMany({
        where: {isActive: true, scope: {in: scopes}},
        include: {rewards: true},
        orderBy: {uiOrder: 'asc'},
    });

    const zone = normalizeTimezone(timezone);
    const now = new Date();
    const activeDefinitions = definitions.filter((definition) =>
        isQuestActiveForDate(toMetaObject(definition.meta), zone, now),
    );
    const questItems: Array<{
        definition: QuestDefinitionWithRewards;
        instance: any;
    }> = [];
    const availablePositioningCount = userJob
        ? await getPositioningTargetCount(userJob.id)
        : null;
    const shouldLimitPositioning =
        availablePositioningCount !== null && availablePositioningCount > 0;

    for (const definition of activeDefinitions) {
        const meta = toMetaObject(definition.meta);
        const quizIndex = typeof meta?.quizIndex === 'number' ? meta.quizIndex : null;
        const quizType = typeof meta?.quizType === 'string' ? meta.quizType : null;

        if (
            definition.scope === QuestScope.USER_JOB
            && quizType === 'POSITIONING'
            && quizIndex !== null
            && shouldLimitPositioning
            && quizIndex > availablePositioningCount!
        ) {
            continue;
        }

        const referenceDate = isOneShotQuest(meta)
            ? definition.scope === QuestScope.USER_JOB
                ? userJob?.createdAt
                : user.createdAt
            : undefined;
        const {periodStartAt, periodEndAt} = getQuestWindow(
            definition.period,
            zone,
            referenceDate,
        );
        const targetCount = await resolveQuestTargetCount(
            definition,
            definition.scope === QuestScope.USER_JOB ? userJob?.id ?? null : null,
        );
        const effectiveDefinition = {
            ...definition,
            targetCount,
        };
        const instance = definition.scope === QuestScope.USER
            ? await ensureUserQuestInstance(
                user.id,
                effectiveDefinition,
                periodStartAt,
                periodEndAt,
            )
            : await ensureQuestInstance(
                userJob!.id,
                effectiveDefinition,
                periodStartAt,
                periodEndAt,
            );

        questItems.push({definition: effectiveDefinition, instance});
    }

    if (lang) {
        const definitionIds = questItems.map((item) => item.definition.id);
        const definitionTranslations = await getTranslationsMap({
            entity: 'QuestDefinition',
            entityIds: definitionIds,
            fields: ['title', 'description'],
            lang,
        });
        for (const item of questItems) {
            item.definition = {
                ...item.definition,
                title:
                    definitionTranslations.get(`${item.definition.id}::title`) ??
                    item.definition.title,
                description:
                    definitionTranslations.get(`${item.definition.id}::description`) ??
                    item.definition.description,
            };
        }
    }

    const mainQuests = questItems.filter(
        (item) => item.definition.category === QuestCategory.MAIN,
    );

    if (mainQuests.length > 0 && userJob) {
        const synced = await syncWeeklyMainQuest(userJob.id, zone);
        if (synced) {
            const target = mainQuests.find((item) => item.definition.code === WEEKLY_MAIN_CODE);
            if (target) {
                target.instance = synced;
            }
        }
    }

    const decorate = async (item: {definition: QuestDefinitionWithRewards; instance: any}) => {
        const lockState = await isQuestLocked(
            userJob?.id ?? '',
            item.definition,
            item.instance.periodStartAt,
            zone,
            user.id,
        );
        const claimable = !lockState.locked
            && item.instance.status === QuestStatus.COMPLETED
            && !item.instance.claimedAt;

        return {
            definition: item.definition,
            instance: item.instance,
            rewards: item.definition.rewards,
            scope: item.definition.scope,
            locked: lockState.locked,
            lockedReason: lockState.locked ? lockState.reason ?? null : null,
            claimable,
        };
    };

    const decoratedByDefinitionId = new Map<string, Awaited<ReturnType<typeof decorate>>>();
    for (const item of questItems) {
        decoratedByDefinitionId.set(item.definition.id, await decorate(item));
    }

    const parentToChildren = new Map<string, string[]>();
    for (const item of questItems) {
        if (!item.definition.parentId) {
            continue;
        }
        const list = parentToChildren.get(item.definition.parentId) ?? [];
        list.push(item.definition.id);
        parentToChildren.set(item.definition.parentId, list);
    }

    const buildTree: any = (definitionId: string, visited: Set<string>) => {
        if (visited.has(definitionId)) {
            return null;
        }
        const decorated = decoratedByDefinitionId.get(definitionId);
        if (!decorated) {
            return null;
        }
        visited.add(definitionId);
        const childrenIds = parentToChildren.get(definitionId) ?? [];
        const children = childrenIds
            .map((childId) => buildTree(childId, visited))
            .filter((child): child is NonNullable<typeof child> => child !== null);
        return {
            ...decorated,
            children,
        };
    };

    const definitionIds = new Set(questItems.map((item) => item.definition.id));
    const mainRoots = mainQuests.filter((item) => {
        const parentId = item.definition.parentId;
        return !parentId || !definitionIds.has(parentId);
    });

    const mains = mainRoots
        .map((item) => buildTree(item.definition.id, new Set()))
        .filter((item): item is NonNullable<typeof item> => item !== null);

    return {
        userJobId: userJob?.id ?? null,
        main: mains[0] ?? null,
        mains,
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
            userId,
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

export const claimUserQuest = async (
    userId: string,
    userQuestId: string,
    timezone?: string,
) => {
    const zone = normalizeTimezone(timezone);
    return prisma.$transaction(async (tx) => {
        const quest = await tx.userQuest.findUnique({
            where: {id: userQuestId},
            include: {
                questDefinition: {include: {rewards: true}},
            },
        });

        if (!quest) {
            throw new Error('Quête introuvable.');
        }

        if (quest.userId !== userId) {
            throw new Error('Accès refusé.');
        }

        const lockState = await isQuestLocked(
            '',
            quest.questDefinition as QuestDefinitionWithRewards,
            quest.periodStartAt,
            zone,
            userId,
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
                    userId,
                    currency,
                    delta: amount,
                    reason: 'QUEST_REWARD',
                    refType: 'UserQuest',
                    refId: quest.id,
                },
            });

            if (currency === CurrencyType.DIAMONDS) {
                await tx.user.update({
                    where: {id: userId},
                    data: {diamonds: {increment: amount}},
                });
            }
        }

        return tx.userQuest.update({
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
