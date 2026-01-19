/* eslint-disable no-console */
import {
    CompetencyType,
    Level,
    PrismaClient,
    LearningResourceScope,
    LearningResourceSource,
    LearningResourceType,
    ModuleStatus,
    ModuleVisibility,
    QuestCategory,
    QuestPeriod,
    QuestScope,
    CurrencyType,
} from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { seedBtsCiel } from './seed_bts_ciel';
import { seedBtsCielUsers } from './seed_bts_ciel_users';

const prisma = new PrismaClient();

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function slugify(input: string): string {
    return input
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
}

type Kind = 'Savoir-faire' | 'Savoir-être';
// type Level = Level.EASY | Level.MEDIUM | Level.HARD | 'Expert';

type Scores = {
    beginner: number;
    intermediate: number;
    advanced: number;
    expert: number;
    max: number;
};

type CompetencyItem = {
    name: string;       // FR label
    kind: Kind;
    level: Level;       // utilisé pour le fallback
    subfamily: string;  // 1 des sous-familles (FR)
    scores?: Scores;    // override facultatif par compétence
};

type FamilyBlock = {
    family: string;                 // FR
    subfamilies: [string, string];  // FR, 2 max
    items: CompetencyItem[];        // 10
};

type JobBlock = {
    jobFamilyName: string;          // FR ("Produit", "Design")
    jobTitle: string;               // EN ("Product Manager", "UI Designer")
    blocks: FamilyBlock[];          // 5 familles * 10
};

// -----------------------------------------------------------------------------
// Traductions FR -> EN pour labels (familles, sous-familles, compétences)
// -----------------------------------------------------------------------------
const LABEL_FR_EN: Record<string, string> = {
    // Job families
    'Produit': 'Product',
    'Design': 'Design',

    // Families & subfamilies JOB_PM
    'Stratégie': 'Strategy',
    'Vision': 'Vision',
    'Marché': 'Market',
    // 'Produit': 'Product',
    'Roadmap': 'Roadmap',
    'Découverte': 'Discovery',
    'Données': 'Data',
    'Analyse': 'Analysis',
    'Mesure': 'Measurement',
    // 'Design': 'Design',
    'UX': 'UX',
    'Recherche': 'Research',
    'Leadership': 'Leadership',
    'Communication': 'Communication',
    'Équipe': 'Team',

    // Families & subfamilies JOB_UI
    'Interface': 'Interface',
    'Composants': 'Components',
    'Visuel': 'Visual design',
    'Couleurs': 'Colors',
    'Typo': 'Typography',
    'Système': 'Design system',
    'Designkit': 'Design kit',
    'Tokens': 'Design tokens',
    'Prototypage': 'Prototyping',
    'Figma': 'Figma',
    'Tests': 'Testing',
    'Collaboration': 'Collaboration',
    'Handoff': 'Handoff',
    'Gestion': 'Management',

    // Competencies JOB_PM
    // 'Vision': 'Vision',
    'Priorisation': 'Prioritization',
    'Alignement': 'Alignment',
    'Objectifs': 'Objectives',
    'Positionnement': 'Positioning',
    'Segmentation': 'Segmentation',
    'Concurrence': 'Competition',
    'Pricing': 'Pricing',
    'Partenariats': 'Partnerships',
    'GoToMarket': 'Go-to-market',
    'Planification': 'Planning',
    'Dépendances': 'Dependencies',
    'Release': 'Release',
    'Estimation': 'Estimation',
    'Backlog': 'Backlog',
    'Hypothèses': 'Hypotheses',
    'Entretiens': 'Interviews',
    'Personas': 'Personas',
    // 'Prototypage': 'Prototyping',
    // 'Tests': 'Testing',
    'SQL': 'SQL',
    'Tableaux': 'Dashboards',
    'Cohortes': 'Cohorts',
    'A/B': 'A/B testing',
    'Modélisation': 'Modeling',
    'KPI': 'KPIs',
    'Instrumentation': 'Instrumentation',
    'Attribution': 'Attribution',
    'Rétention': 'Retention',
    'Monétisation': 'Monetization',
    'Parcours': 'User journeys',
    'Accessibilité': 'Accessibility',
    'Microcopies': 'Microcopy',
    'Information': 'Information architecture',
    'Interaction': 'Interaction design',
    'Méthodes': 'Methods',
    'Guides': 'Guides',
    'Synthèse': 'Synthesis',
    'Insight': 'Insights',
    'Journaux': 'Diary studies',
    'Storytelling': 'Storytelling',
    'Négociation': 'Negotiation',
    'Feedback': 'Feedback',
    'Conflits': 'Conflict management',
    'Influence': 'Influence',
    'Mentorat': 'Mentoring',
    'Recrutement': 'Recruiting',
    'Culture': 'Culture',
    'Délégation': 'Delegation',
    'Priorités': 'Priorities',

    // Competencies JOB_UI
    'Grille': 'Grid',
    'Hiérarchie': 'Hierarchy',
    'Espacement': 'Spacing',
    'Réactivité': 'Responsiveness',
    'Empathie': 'Empathy',
    'États': 'States',
    'Variants': 'Variants',
    'Navigation': 'Navigation',
    'Rigueur': 'Rigor',
    'Palette': 'Palette',
    'Contraste': 'Contrast',
    'Harmonie': 'Harmony',
    'Marque': 'Brand',
    'Sensibilité': 'Sensitivity',
    'Échelle': 'Scale',
    'Lisibilité': 'Legibility',
    'Interlignage': 'Line height',
    'Glyphes': 'Glyphs',
    'Esthétique': 'Aesthetics',
    'Bibliothèque': 'Library',
    'Nomenclature': 'Naming',
    'Versioning': 'Versioning',
    'Documentation': 'Documentation',
    'Exigence': 'High standards',
    'Espaces': 'Spacing',
    'Rayons': 'Corner radius',
    'Discipline': 'Discipline',
    'AutoLayout': 'AutoLayout',
    'Usabilité': 'Usability',
    'Scénarios': 'Scenarios',
    'Itérations': 'Iterations',
    'Patience': 'Patience',
    'Specs': 'Specs',
    'Redlines': 'Redlines',
    'Assets': 'Assets',
    'Export': 'Export',
    'Clarté': 'Clarity',
    'Ateliers': 'Workshops',
};

function toEn(labelFr: string): string {
    return LABEL_FR_EN[labelFr] ?? labelFr;
}

// Job titles FR (si tu veux des vrais libellés FR)
const JOB_TITLE_FR: Record<string, string> = {
    'Product Manager': 'Product Manager',   // ou "Chef de produit"
    'UI Designer': 'UI Designer',
};

const DEFAULT_MODULES = [
    {
        slug: 'daily-quiz',
        nameFr: 'Compétences',
        nameEn: 'Daily Quiz',
        descriptionFr: 'Quiz quotidiens pour progresser.',
        descriptionEn: 'Daily quizzes to build skills.',
    },
    {
        slug: 'leaderboard',
        nameFr: 'Parcours',
        nameEn: 'Leaderboard',
        descriptionFr: 'Classement des utilisateurs.',
        descriptionEn: 'User ranking leaderboard.',
    },
    {
        slug: 'learning-resources',
        nameFr: 'Ressources',
        nameEn: 'Learning Resources',
        descriptionFr: 'Ressources pour apprendre.',
        descriptionEn: 'Learning resources.',
    },
];

async function seedModules() {
    for (const module of DEFAULT_MODULES) {
        const record = await prisma.module.upsert({
            where: { slug: module.slug },
            update: {
                name: module.nameFr,
                description: module.descriptionFr,
                status: ModuleStatus.ACTIVE,
                visibility: ModuleVisibility.PUBLIC,
                defaultOnLanding: true,
            },
            create: {
                slug: module.slug,
                name: module.nameFr,
                description: module.descriptionFr,
                status: ModuleStatus.ACTIVE,
                visibility: ModuleVisibility.PUBLIC,
                defaultOnLanding: true,
            },
        });

        await prisma.translation.upsert({
            where: {
                entity_entityId_field_langCode: {
                    entity: 'Module',
                    entityId: record.id,
                    field: 'name',
                    langCode: 'fr',
                },
            },
            update: { value: module.nameFr },
            create: {
                entity: 'Module',
                entityId: record.id,
                field: 'name',
                langCode: 'fr',
                value: module.nameFr,
            },
        });

        await prisma.translation.upsert({
            where: {
                entity_entityId_field_langCode: {
                    entity: 'Module',
                    entityId: record.id,
                    field: 'name',
                    langCode: 'en',
                },
            },
            update: { value: module.nameEn },
            create: {
                entity: 'Module',
                entityId: record.id,
                field: 'name',
                langCode: 'en',
                value: module.nameEn,
            },
        });

        await prisma.translation.upsert({
            where: {
                entity_entityId_field_langCode: {
                    entity: 'Module',
                    entityId: record.id,
                    field: 'description',
                    langCode: 'fr',
                },
            },
            update: { value: module.descriptionFr },
            create: {
                entity: 'Module',
                entityId: record.id,
                field: 'description',
                langCode: 'fr',
                value: module.descriptionFr,
            },
        });

        await prisma.translation.upsert({
            where: {
                entity_entityId_field_langCode: {
                    entity: 'Module',
                    entityId: record.id,
                    field: 'description',
                    langCode: 'en',
                },
            },
            update: { value: module.descriptionEn },
            create: {
                entity: 'Module',
                entityId: record.id,
                field: 'description',
                langCode: 'en',
                value: module.descriptionEn,
            },
        });
    }

    console.log(`✓ Seeded ${DEFAULT_MODULES.length} default modules.`);
}

async function seedQuestDefinitions() {
    console.log(`\n=== Seeding quest definitions ===`);

    await prisma.questDefinition.updateMany({
        where: {
            code: {
                in: [
                    'WEEKLY_MAIN_5_DAILY_QUIZZES',
                    'WEEKLY_BRANCH_SCORE_80',
                    'WEEKLY_BRANCH_COMPLETE_3_DAILY',
                    'WEEKLY_COLLECTION_5_RESOURCES',
                    'POSITIONING_COMPLETE_QUIZZES',
                ],
            },
        },
        data: { isActive: false },
    });

    // Pas de quêtes DAILY dans le seed.

    const positioningGroup = await prisma.questGroup.upsert({
        where: { code: 'POSITIONING_PATH' },
        update: {
            title: 'Finaliser le parcours de positionnement',
            description: 'Completer chaque questionnaire de positionnement.',
            scope: QuestScope.USER_JOB,
            period: QuestPeriod.ONCE,
            meta: { oneShot: true },
            isActive: true,
            uiOrder: 5,
            updatedAt: new Date(),
        },
        create: {
            code: 'POSITIONING_PATH',
            title: 'Finaliser le parcours de positionnement',
            description: 'Completer chaque questionnaire de positionnement.',
            scope: QuestScope.USER_JOB,
            period: QuestPeriod.ONCE,
            meta: { oneShot: true },
            isActive: true,
            uiOrder: 5,
        },
    });

    const positioningDefs = [
        {
            code: 'POSITIONING_QUIZ_1',
            title: 'Questionnaire de positionnement #1',
            description: 'Completer le questionnaire de positionnement #1.',
            quizIndex: 1,
            requiresQuestCode: null,
            uiOrder: 1,
        },
        {
            code: 'POSITIONING_QUIZ_2',
            title: 'Questionnaire de positionnement #2',
            description: 'Completer le questionnaire de positionnement #2.',
            quizIndex: 2,
            requiresQuestCode: 'POSITIONING_QUIZ_1',
            uiOrder: 2,
        },
        {
            code: 'POSITIONING_QUIZ_3',
            title: 'Questionnaire de positionnement #3',
            description: 'Completer le questionnaire de positionnement #3.',
            quizIndex: 3,
            requiresQuestCode: 'POSITIONING_QUIZ_2',
            uiOrder: 3,
        },
        {
            code: 'POSITIONING_QUIZ_4',
            title: 'Questionnaire de positionnement #4',
            description: 'Completer le questionnaire de positionnement #4.',
            quizIndex: 4,
            requiresQuestCode: 'POSITIONING_QUIZ_3',
            uiOrder: 4,
        },
        {
            code: 'POSITIONING_QUIZ_5',
            title: 'Questionnaire de positionnement #5',
            description: 'Completer le questionnaire de positionnement #5.',
            quizIndex: 5,
            requiresQuestCode: 'POSITIONING_QUIZ_4',
            uiOrder: 5,
        },
    ];

    const positioningByCode = new Map<string, { id: string; code: string }>();
    for (const def of positioningDefs) {
        const parentId = def.requiresQuestCode
            ? positioningByCode.get(def.requiresQuestCode)?.id ?? null
            : null;
        const isRoot = !def.requiresQuestCode;
        const quest = await prisma.questDefinition.upsert({
            where: { code: def.code },
            update: {
                title: def.title,
                description: def.description,
                period: QuestPeriod.ONCE,
                category: isRoot ? QuestCategory.MAIN : QuestCategory.BRANCH,
                scope: QuestScope.USER_JOB,
                eventKey: 'QUIZ_COMPLETED',
                targetCount: 1,
                meta: {
                    quizType: 'POSITIONING',
                    quizIndex: def.quizIndex,
                    oneShot: true,
                    ...(def.requiresQuestCode ? { requiresQuestCode: def.requiresQuestCode } : {}),
                },
                isActive: true,
                parentId,
                uiOrder: def.uiOrder,
                updatedAt: new Date(),
            },
            create: {
                code: def.code,
                title: def.title,
                description: def.description,
                period: QuestPeriod.ONCE,
                category: isRoot ? QuestCategory.MAIN : QuestCategory.BRANCH,
                scope: QuestScope.USER_JOB,
                eventKey: 'QUIZ_COMPLETED',
                targetCount: 1,
                meta: {
                    quizType: 'POSITIONING',
                    quizIndex: def.quizIndex,
                    oneShot: true,
                    ...(def.requiresQuestCode ? { requiresQuestCode: def.requiresQuestCode } : {}),
                },
                isActive: true,
                parentId,
                uiOrder: def.uiOrder,
            },
        });
        positioningByCode.set(def.code, { id: quest.id, code: def.code });
    }

    await prisma.questGroupItem.deleteMany({
        where: { questGroupId: positioningGroup.id },
    });
    await prisma.questGroupItem.createMany({
        data: positioningDefs.map((def, idx) => ({
            questGroupId: positioningGroup.id,
            questDefinitionId: positioningByCode.get(def.code)!.id,
            isRequired: true,
            uiOrder: def.uiOrder,
        })),
    });

    const shareQuest = await prisma.questDefinition.upsert({
        where: { code: 'MONTHLY_SHARE_REFERRAL_SIGNUP' },
        update: {
            title: '1 referral signup',
            description: 'Obtenir 1 inscription via referral ce mois-ci.',
            period: QuestPeriod.MONTHLY,
            category: QuestCategory.SHARE,
            scope: QuestScope.USER,
            eventKey: 'REFERRAL_SIGNUP',
            targetCount: 1,
            meta: {},
            isActive: true,
            uiOrder: 10,
            updatedAt: new Date(),
        },
        create: {
            code: 'MONTHLY_SHARE_REFERRAL_SIGNUP',
            title: '1 referral signup',
            description: 'Obtenir 1 inscription via referral ce mois-ci.',
            period: QuestPeriod.MONTHLY,
            category: QuestCategory.SHARE,
            scope: QuestScope.USER,
            eventKey: 'REFERRAL_SIGNUP',
            targetCount: 1,
            meta: {},
            isActive: true,
            uiOrder: 10,
        },
    });

    await prisma.questReward.deleteMany({ where: { questDefinitionId: shareQuest.id } });
    await prisma.questReward.createMany({
        data: [
            {
                questDefinitionId: shareQuest.id,
                currency: CurrencyType.DIAMONDS,
                amount: 40,
            },
        ],
    });

    console.log(`✓ Quest definitions seeded.`);
}

// -----------------------------------------------------------------------------
// Fallback de scores par niveau
// -----------------------------------------------------------------------------
function defaultScoresForLevel(level: Level): Scores {
    switch (level) {
        case Level.EASY:
            return { beginner: 1, intermediate: 1, advanced: 2, expert: 3, max: 4 };
        case Level.MEDIUM:
            return { beginner: 1, intermediate: 2, advanced: 3, expert: 4, max: 5 };
        case Level.HARD:
            return { beginner: 2, intermediate: 3, advanced: 4, expert: 4, max: 5 };
        case Level.EXPERT:
            return { beginner: 2, intermediate: 3, advanced: 4, expert: 5, max: 5 };
        case Level.MIX:
            return { beginner: 1, intermediate: 2, advanced: 3, expert: 4, max: 5 };
        default:
            throw new Error(`Unknown level: ${level}`);
    }
}

function mergeAndValidateScores(item: CompetencyItem): Scores {
    const s = item.scores ?? defaultScoresForLevel(item.level);
    const monotonic =
        s.beginner <= s.intermediate &&
        s.intermediate <= s.advanced &&
        s.advanced <= s.expert &&
        s.expert <= s.max;

    if (!monotonic) {
        throw new Error(
            `Invalid scores for "${item.name}": ` +
            `b:${s.beginner} i:${s.intermediate} a:${s.advanced} e:${s.expert} m:${s.max}`,
        );
    }
    if (s.beginner < 0 || s.max < 1) {
        throw new Error(`Scores out of range for "${item.name}"`);
    }
    return s;
}

// -----------------------------------------------------------------------------
// Données Product Manager
// -----------------------------------------------------------------------------
const JOB_PM: JobBlock = {
    jobFamilyName: 'Produit',
    jobTitle: 'Product Manager',
    blocks: [
        {
            family: 'Stratégie',
            subfamilies: ['Vision', 'Marché'],
            items: [
                {
                    name: 'Vision',
                    kind: 'Savoir-être',
                    level: Level.HARD,
                    subfamily: 'Vision',
                    scores: { beginner: 2, intermediate: 3, advanced: 3, expert: 4, max: 4 },
                },
                { name: 'Priorisation', kind: 'Savoir-faire', level: Level.HARD, subfamily: 'Vision' },
                { name: 'Alignement', kind: 'Savoir-être', level: Level.MEDIUM, subfamily: 'Vision' },
                { name: 'Objectifs', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Vision' },
                { name: 'Positionnement', kind: 'Savoir-faire', level: Level.HARD, subfamily: 'Vision' },
                { name: 'Segmentation', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Marché' },
                { name: 'Concurrence', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Marché' },
                {
                    name: 'Pricing',
                    kind: 'Savoir-faire',
                    level: Level.HARD,
                    subfamily: 'Marché',
                    scores: { beginner: 2, intermediate: 3, advanced: 4, expert: 4, max: 5 },
                },
                { name: 'Partenariats', kind: 'Savoir-être', level: Level.HARD, subfamily: 'Marché' },
                { name: 'GoToMarket', kind: 'Savoir-faire', level: Level.HARD, subfamily: 'Marché' },
            ],
        },
        {
            family: 'Produit',
            subfamilies: ['Roadmap', 'Découverte'],
            items: [
                { name: 'Planification', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Roadmap' },
                { name: 'Dépendances', kind: 'Savoir-faire', level: Level.HARD, subfamily: 'Roadmap' },
                {
                    name: 'Release',
                    kind: 'Savoir-faire',
                    level: Level.MEDIUM,
                    subfamily: 'Roadmap',
                    scores: { beginner: 1, intermediate: 2, advanced: 3, expert: 3, max: 4 },
                },
                { name: 'Estimation', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Roadmap' },
                { name: 'Backlog', kind: 'Savoir-faire', level: Level.EASY, subfamily: 'Roadmap' },
                { name: 'Hypothèses', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Découverte' },
                { name: 'Entretiens', kind: 'Savoir-être', level: Level.MEDIUM, subfamily: 'Découverte' },
                { name: 'Personas', kind: 'Savoir-faire', level: Level.EASY, subfamily: 'Découverte' },
                { name: 'Prototypage', kind: 'Savoir-faire', level: Level.EASY, subfamily: 'Découverte' },
                { name: 'Tests', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Découverte' },
            ],
        },
        {
            family: 'Données',
            subfamilies: ['Analyse', 'Mesure'],
            items: [
                { name: 'SQL', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Analyse' },
                { name: 'Tableaux', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Analyse' },
                { name: 'Cohortes', kind: 'Savoir-faire', level: Level.HARD, subfamily: 'Analyse' },
                { name: 'A/B', kind: 'Savoir-faire', level: Level.HARD, subfamily: 'Analyse' },
                {
                    name: 'Modélisation',
                    kind: 'Savoir-faire',
                    level: Level.HARD,
                    subfamily: 'Analyse',
                    scores: { beginner: 2, intermediate: 3, advanced: 4, expert: 5, max: 5 },
                },
                { name: 'KPI', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Mesure' },
                { name: 'Instrumentation', kind: 'Savoir-faire', level: Level.HARD, subfamily: 'Mesure' },
                { name: 'Attribution', kind: 'Savoir-faire', level: Level.HARD, subfamily: 'Mesure' },
                { name: 'Rétention', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Mesure' },
                { name: 'Monétisation', kind: 'Savoir-être', level: Level.HARD, subfamily: 'Mesure' },
            ],
        },
        {
            family: 'Design',
            subfamilies: ['UX', 'Recherche'],
            items: [
                { name: 'Parcours', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'UX' },
                { name: 'Accessibilité', kind: 'Savoir-faire', level: Level.HARD, subfamily: 'UX' },
                { name: 'Microcopies', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'UX' },
                { name: 'Information', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'UX' },
                { name: 'Interaction', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'UX' },
                { name: 'Méthodes', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Recherche' },
                { name: 'Guides', kind: 'Savoir-faire', level: Level.EASY, subfamily: 'Recherche' },
                { name: 'Synthèse', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Recherche' },
                { name: 'Insight', kind: 'Savoir-être', level: Level.HARD, subfamily: 'Recherche' },
                { name: 'Journaux', kind: 'Savoir-faire', level: Level.EASY, subfamily: 'Recherche' },
            ],
        },
        {
            family: 'Leadership',
            subfamilies: ['Communication', 'Équipe'],
            items: [
                { name: 'Storytelling', kind: 'Savoir-être', level: Level.HARD, subfamily: 'Communication' },
                { name: 'Négociation', kind: 'Savoir-être', level: Level.HARD, subfamily: 'Communication' },
                {
                    name: 'Feedback',
                    kind: 'Savoir-être',
                    level: Level.MEDIUM,
                    subfamily: 'Communication',
                    scores: { beginner: 1, intermediate: 2, advanced: 2, expert: 3, max: 4 },
                },
                { name: 'Conflits', kind: 'Savoir-être', level: Level.HARD, subfamily: 'Communication' },
                { name: 'Influence', kind: 'Savoir-être', level: Level.HARD, subfamily: 'Communication' },
                { name: 'Mentorat', kind: 'Savoir-être', level: Level.MEDIUM, subfamily: 'Équipe' },
                { name: 'Recrutement', kind: 'Savoir-faire', level: Level.HARD, subfamily: 'Équipe' },
                { name: 'Culture', kind: 'Savoir-être', level: Level.MEDIUM, subfamily: 'Équipe' },
                { name: 'Délégation', kind: 'Savoir-être', level: Level.MEDIUM, subfamily: 'Équipe' },
                { name: 'Priorités', kind: 'Savoir-être', level: Level.HARD, subfamily: 'Équipe' },
            ],
        },
    ],
};

// -----------------------------------------------------------------------------
// Données UI Designer
// -----------------------------------------------------------------------------
const JOB_UI: JobBlock = {
    jobFamilyName: 'Design',
    jobTitle: 'UI Designer',
    blocks: [
        {
            family: 'Interface',
            subfamilies: ['Layout', 'Composants'],
            items: [
                { name: 'Grille', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Layout' },
                { name: 'Hiérarchie', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Layout' },
                {
                    name: 'Espacement',
                    kind: 'Savoir-faire',
                    level: Level.MEDIUM,
                    subfamily: 'Layout',
                    scores: { beginner: 1, intermediate: 2, advanced: 3, expert: 3, max: 4 },
                },
                { name: 'Réactivité', kind: 'Savoir-faire', level: Level.HARD, subfamily: 'Layout' },
                { name: 'Empathie', kind: 'Savoir-être', level: Level.MEDIUM, subfamily: 'Layout' },
                { name: 'Composants', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Composants' },
                { name: 'États', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Composants' },
                { name: 'Variants', kind: 'Savoir-faire', level: Level.HARD, subfamily: 'Composants' },
                { name: 'Navigation', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Composants' },
                {
                    name: 'Rigueur',
                    kind: 'Savoir-être',
                    level: Level.HARD,
                    subfamily: 'Composants',
                    scores: { beginner: 2, intermediate: 3, advanced: 4, expert: 4, max: 5 },
                },
            ],
        },
        {
            family: 'Visuel',
            subfamilies: ['Couleurs', 'Typo'],
            items: [
                { name: 'Palette', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Couleurs' },
                { name: 'Contraste', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Couleurs' },
                { name: 'Harmonie', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Couleurs' },
                { name: 'Marque', kind: 'Savoir-faire', level: Level.HARD, subfamily: 'Couleurs' },
                { name: 'Sensibilité', kind: 'Savoir-être', level: Level.MEDIUM, subfamily: 'Couleurs' },
                { name: 'Échelle', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Typo' },
                {
                    name: 'Lisibilité',
                    kind: 'Savoir-faire',
                    level: Level.MEDIUM,
                    subfamily: 'Typo',
                    scores: { beginner: 1, intermediate: 2, advanced: 3, expert: 4, max: 5 },
                },
                { name: 'Interlignage', kind: 'Savoir-faire', level: Level.EASY, subfamily: 'Typo' },
                { name: 'Glyphes', kind: 'Savoir-faire', level: Level.EASY, subfamily: 'Typo' },
                { name: 'Esthétique', kind: 'Savoir-être', level: Level.HARD, subfamily: 'Typo' },
            ],
        },
        {
            family: 'Système',
            subfamilies: ['Designkit', 'Tokens'],
            items: [
                { name: 'Bibliothèque', kind: 'Savoir-faire', level: Level.HARD, subfamily: 'Designkit' },
                { name: 'Nomenclature', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Designkit' },
                { name: 'Versioning', kind: 'Savoir-faire', level: Level.HARD, subfamily: 'Designkit' },
                { name: 'Documentation', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Designkit' },
                { name: 'Exigence', kind: 'Savoir-être', level: Level.HARD, subfamily: 'Designkit' },
                { name: 'Couleurs', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Tokens' },
                { name: 'Typo', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Tokens' },
                { name: 'Espaces', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Tokens' },
                { name: 'Rayons', kind: 'Savoir-faire', level: Level.EASY, subfamily: 'Tokens' },
                { name: 'Discipline', kind: 'Savoir-être', level: Level.HARD, subfamily: 'Tokens' },
            ],
        },
        {
            family: 'Prototypage',
            subfamilies: ['Figma', 'Tests'],
            items: [
                { name: 'AutoLayout', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Figma' },
                { name: 'Interactions', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Figma' },
                { name: 'Composants', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Figma' },
                { name: 'Variants', kind: 'Savoir-faire', level: Level.HARD, subfamily: 'Figma' },
                {
                    name: 'Curiosité',
                    kind: 'Savoir-être',
                    level: Level.MEDIUM,
                    subfamily: 'Figma',
                    scores: { beginner: 1, intermediate: 2, advanced: 2, expert: 3, max: 4 },
                },
                { name: 'Usabilité', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Tests' },
                { name: 'Scénarios', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Tests' },
                { name: 'Parcours', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Tests' },
                { name: 'Itérations', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Tests' },
                { name: 'Patience', kind: 'Savoir-être', level: Level.MEDIUM, subfamily: 'Tests' },
            ],
        },
        {
            family: 'Collaboration',
            subfamilies: ['Handoff', 'Gestion'],
            items: [
                { name: 'Specs', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Handoff' },
                { name: 'Redlines', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Handoff' },
                { name: 'Assets', kind: 'Savoir-faire', level: Level.EASY, subfamily: 'Handoff' },
                { name: 'Export', kind: 'Savoir-faire', level: Level.EASY, subfamily: 'Handoff' },
                { name: 'Clarté', kind: 'Savoir-être', level: Level.MEDIUM, subfamily: 'Handoff' },
                { name: 'Feedback', kind: 'Savoir-être', level: Level.MEDIUM, subfamily: 'Gestion' },
                { name: 'Planning', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Gestion' },
                { name: 'Priorités', kind: 'Savoir-être', level: Level.MEDIUM, subfamily: 'Gestion' },
                { name: 'Ateliers', kind: 'Savoir-faire', level: Level.MEDIUM, subfamily: 'Gestion' },
                {
                    name: 'Alignement',
                    kind: 'Savoir-être',
                    level: Level.HARD,
                    subfamily: 'Gestion',
                    scores: { beginner: 2, intermediate: 3, advanced: 4, expert: 4, max: 5 },
                },
            ],
        },
    ],
};

// -----------------------------------------------------------------------------
// Upserts & Translations
// -----------------------------------------------------------------------------
async function createTranslation(
    entity: string,
    entityId: string,
    field: string,
    langCode: string,
    value: string,
) {
    await prisma.translation.upsert({
        where: {
            entity_entityId_field_langCode: {
                entity,
                entityId,
                field,
                langCode,
            },
        },
        update: {
            value,
            updatedAt: new Date(),
        },
        create: {
            entity,
            entityId,
            field,
            langCode,
            value,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });
}

async function createBiLangTranslation(
    entity: string,
    entityId: string,
    field: string,
    valueEn: string,
    valueFr: string,
) {
    await createTranslation(entity, entityId, field, 'en', valueEn);
    await createTranslation(entity, entityId, field, 'fr', valueFr);
}

async function upsertFamily(nameFr: string, parentId?: string | null) {
    const slug = slugify(nameFr);
    const base = {
        name: nameFr,
        slug,
        description: "",
        parentId: parentId ?? null,
        updatedAt: new Date(),
    };
    const family = await prisma.competenciesFamily.upsert({
        where: { name: nameFr },
        update: base,
        create: { ...base, createdAt: new Date() },
    });

    const nameEn = toEn(nameFr);
    await createBiLangTranslation('CompetenciesFamily', family.id, 'name', nameEn, nameFr);

    return family;
}

async function upsertCompetencyWithScores(nameFr: string, s: Scores, kind: string, level: Level) {
    const slug = slugify(nameFr);
    const competency = await prisma.competency.upsert({
        where: { slug },
        update: {
            slug,
            // beginnerScore: s.beginner,
            // intermediateScore: s.intermediate,
            // advancedScore: s.advanced,
            // expertScore: s.expert,
            // maxScore: s.max,
            updatedAt: new Date(),
            type: kind === 'Savoir-faire' ? CompetencyType.HARD_SKILL : CompetencyType.SOFT_SKILL,
            level: level,
        },
        create: {
            name: nameFr,
            slug,
            // beginnerScore: s.beginner,
            // intermediateScore: s.intermediate,
            // advancedScore: s.advanced,
            // expertScore: s.expert,
            // maxScore: s.max,
            type: kind === 'Savoir-faire' ? CompetencyType.HARD_SKILL : CompetencyType.SOFT_SKILL,
            createdAt: new Date(),
            updatedAt: new Date(),
            level: level,
        },
    });

    const nameEn = toEn(nameFr);
    await createBiLangTranslation('Competency', competency.id, 'name', nameEn, nameFr);

    return competency;
}

// async function upsertJobFamily(nameFr: string) {
//     const jf = await prisma.jobFamily.upsert({
//         where: {name: nameFr},
//         update: {slug: slugify(nameFr), updatedAt: new Date()},
//         create: {
//             name: nameFr,
//             slug: slugify(nameFr),
//             createdAt: new Date(),
//             updatedAt: new Date(),
//         },
//     });
//
//     const nameEn = toEn(nameFr);
//     await createBiLangTranslation('JobFamily', jf.id, 'name', nameEn, nameFr);
//
//     return jf;
// }

async function upsertJob(jobFamilyId: string, titleEn: string, descriptionFr?: string | null) {
    const existing = await prisma.job.findFirst({ where: { title: titleEn, jobFamilyId } });
    if (existing) {
        return prisma.job.update({
            where: { id: existing.id },
            data: {
                slug: slugify(titleEn),
                description: descriptionFr ?? existing.description,
                isActive: true,
                updatedAt: new Date(),
            },
        });
    }
    return prisma.job.create({
        data: {
            jobFamilyId,
            title: titleEn, // stocké en EN
            slug: slugify(titleEn),
            description: descriptionFr ?? null, // FR stocké en base
            isActive: true,
            popularity: 0,
            backgroundColor: '#FFFFFFFF',
            foregroundColor: '#FFFFFFFF',
            textColor: '#FFFFFFFF',
            overlayColor: '#FFFFFFFF',
            imageIndex: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });
}

// -----------------------------------------------------------------------------
// Seeding d’un rôle
// -----------------------------------------------------------------------------
// async function seedJob(job: JobBlock) {
//     console.log(`\n=== Seeding job: ${job.jobTitle} ===`);
//
//     // Families + subfamilies
//     const familyIds = new Set<string>();
//     const familyMap = new Map<string, string>();
//     const subfamilyMap = new Map<string, string>();
//
//     for (const block of job.blocks) {
//         const fam = await upsertFamily(block.family);
//         familyMap.set(block.family, fam.id);
//         familyIds.add(fam.id);
//
//         for (const sub of block.subfamilies) {
//             const subFam = await upsertFamily(sub, fam.id);
//             subfamilyMap.set(`${block.family}:${sub}`, subFam.id);
//             familyIds.add(subFam.id);
//         }
//     }
//
//     // Competencies
//     const competencyIds: string[] = [];
//
//     for (const block of job.blocks) {
//         const famId = familyMap.get(block.family)!;
//
//         for (const item of block.items) {
//             const scores = mergeAndValidateScores(item);
//             const comp = await upsertCompetencyWithScores(item.name, scores, item.kind, item.level);
//             competencyIds.push(comp.id);
//
//             const subId = subfamilyMap.get(`${block.family}:${item.subfamily}`)!;
//
//             await prisma.competency.update({
//                 where: {id: comp.id},
//                 data: {
//                     families: {
//                         connect: [{id: famId}, {id: subId}],
//                     },
//                 },
//             });
//         }
//     }
//
//     // JobFamily + Job
//     // const jf = await upsertJobFamily(job.jobFamilyName);
//
//     const titleEn = job.jobTitle;
//     const titleFr = JOB_TITLE_FR[job.jobTitle] ?? job.jobTitle;
//
//     let descriptionFr: string;
//     let descriptionEn: string;
//
//     if (job.jobTitle === 'Product Manager') {
//         descriptionFr = "Le Product Manager est responsable de la vision, de la stratégie et de la réussite du produit.\n" +
//             "Il travaille à l’intersection du business, de la technologie et du design pour créer une solution qui apporte une réelle valeur aux utilisateurs.\n" +
//             "Son rôle consiste à comprendre les besoins du marché et à les transformer en objectifs clairs et réalisables.\n" +
//             "Il définit la feuille de route produit, priorise les fonctionnalités et s’assure que chaque décision contribue à la mission de l’entreprise.\n" +
//             "Le PM collabore étroitement avec les équipes techniques, design et marketing pour coordonner le développement et le lancement du produit.\n" +
//             "Il analyse les données d’usage et les retours clients afin d’ajuster la stratégie et d’améliorer en continu la performance.\n" +
//             "Le Product Manager doit être capable de prendre des décisions rapides basées sur la donnée et la vision long terme.\n" +
//             "Il fixe les indicateurs clés de succès (KPIs) et mesure régulièrement leur évolution.\n" +
//             "Il veille également à la cohérence de l’expérience sur tous les canaux — web, mobile et autres interfaces.\n" +
//             "Le PM agit comme la voix du client, défend ses besoins et s’assure que le produit réponde à de vraies attentes.\n" +
//             "Son objectif final est de construire un produit durable, utile et aligné avec les ambitions stratégiques de l’entreprise.\n" +
//             "C’est un rôle d’équilibre entre vision, exécution et communication.";
//         descriptionEn = "The Product Manager is responsible for the vision, strategy, and overall success of the product.\n" +
//             "They operate at the crossroads of business, technology, and design to build a solution that truly delivers value.\n" +
//             "Their mission is to understand market and user needs and turn them into clear, actionable goals.\n" +
//             "They define the product roadmap, prioritize features, and ensure every decision supports the company’s mission.\n" +
//             "The PM works closely with engineering, design, and marketing teams to coordinate development and launches.\n" +
//             "They analyze usage data and customer feedback to refine strategy and continuously improve performance.\n" +
//             "A Product Manager must be able to make fast, data-informed decisions while keeping a long-term vision.\n" +
//             "They establish key success indicators (KPIs) and monitor progress toward them.\n" +
//             "They also ensure consistency across all user touchpoints — web, mobile, and beyond.\n" +
//             "The PM acts as the customer’s voice, advocating for user needs and real-world impact.\n" +
//             "Their ultimate goal is to build a product that is sustainable, useful, and strategically aligned.\n" +
//             "It’s a role that balances vision, execution, and communication.";
//     } else {
//         descriptionFr = "Le UI Designer conçoit l’interface visuelle du produit et façonne son identité graphique.\n" +
//             "Il traduit les besoins des utilisateurs et les objectifs business en expériences visuelles claires, harmonieuses et engageantes.\n" +
//             "Son rôle consiste à créer des interfaces intuitives, modernes et cohérentes sur toutes les plateformes.\n" +
//             "Il collabore avec les UX Designers pour transformer les parcours utilisateurs en maquettes détaillées et fonctionnelles.\n" +
//             "Le UI Designer travaille également avec les développeurs afin de garantir la fidélité du rendu final et la qualité de l’expérience.\n" +
//             "Il définit le design system, la palette de couleurs, la typographie et la hiérarchie visuelle du produit.\n" +
//             "Le designer veille à maintenir une cohérence forte entre les composants et les interactions.\n" +
//             "Il s’assure que chaque élément visuel ait une fonction claire et renforce la compréhension de l’utilisateur.\n" +
//             "Le UI Designer contribue à rendre le produit accessible, esthétique et agréable à utiliser au quotidien.\n" +
//             "Il suit les tendances graphiques du moment tout en gardant une approche durable et cohérente avec la marque.\n" +
//             "C’est un rôle créatif et rigoureux qui allie sens du détail, empathie et compréhension des contraintes techniques.\n" +
//             "Son objectif : rendre le produit à la fois beau, fonctionnel et mémorable.";
//         descriptionEn = "The UI Designer is responsible for crafting the product’s visual interface and defining its graphic identity.\n" +
//             "They translate user needs and business goals into clear, consistent, and engaging visual experiences.\n" +
//             "Their mission is to design intuitive, modern, and coherent interfaces across all platforms.\n" +
//             "They collaborate with UX Designers to transform user journeys into detailed, functional mockups.\n" +
//             "The UI Designer also works with developers to ensure high visual fidelity and seamless user experience.\n" +
//             "They define the design system, color palette, typography, and visual hierarchy of the product.\n" +
//             "The designer maintains strong consistency across all visual components and interactions.\n" +
//             "They make sure every element serves a clear purpose and supports usability.\n" +
//             "The UI Designer helps make the product accessible, attractive, and enjoyable to use every day.\n" +
//             "They stay up to date with visual trends while ensuring long-term consistency with the brand identity.\n" +
//             "This role combines creativity, precision, and a deep understanding of technical constraints.\n" +
//             "Their goal is to make the product both beautiful, functional, and memorable.";
//     }
//
//     let job2 = await upsertJob(jf.id, titleEn, descriptionFr);
//
//     // Traductions Job (title + description)
//     await createBiLangTranslation('Job', job2.id, 'title', titleEn, titleFr);
//     await createBiLangTranslation('Job', job2.id, 'description', descriptionEn, descriptionFr);
//
//     // Relier Job -> Competencies & Families
//     await prisma.job.update({
//         where: {id: job2.id},
//         data: {
//             competencies: {
//                 connect: competencyIds.map((id) => ({id})),
//             },
//             competenciesFamilies: {
//                 connect: Array.from(familyIds).map((id) => ({id})),
//             },
//         },
//     });
//
//     console.log(`✓ ${job.jobTitle}: ${competencyIds.length} compétences, ${familyIds.size} familles liées`);
// }

// model Role {
//     id          String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
//     name        String        @unique(map: "role_name") @db.VarChar(255)
//     createdAt   DateTime      @default(now()) @db.Timestamp(0)
//     updatedAt   DateTime      @default(now()) @db.Timestamp(0)
//     permissions Permissions[]
//     users       User[]
// }

async function seedRole(name: string) {
    console.log(`\n=== Seeding role: ${name} ===`);
    const role = await prisma.role.upsert({
        where: { name },
        update: { updatedAt: new Date() },
        create: {
            name,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });
    console.log(`✓ Role "${name}" upserted with ID: ${role.id}`);
}

type LearningResourceSeed = {
    title: string;
    description?: string | null;
    type: 'ARTICLE' | 'VIDEO' | 'PODCAST';
    url: string;
    provider?: string | null;
    languageCode?: string | null;
    estimatedDurationSeconds?: number | null;
    thumbnailUrl?: string | null;
    relevance?: string | null;
    verifiedAt?: string | null;
    paywalled?: boolean | null;
    jobTitle: string;
};

type LearningResourceSeedFile = {
    jobTitle?: string;
    jobFamilyName?: string;
    resources: LearningResourceSeed[];
};

function normalizeUrl(url: string): string {
    return url.replace(/\s+/g, '').trim();
}

const ARTICLE_CONTENT_FILES = [
    'uploads/Murya_Apprendre_Gagner.md',
    'uploads/fichier_2_ANSSI_10_regles_or_securite_numerique.md',
    'uploads/fichier_3_PaloAlto_roles_responsabilites_SOC.md',
    'uploads/fichier_4_Wiz_guide_SOC.md',
    'uploads/fichier_5_ANSSI_10_regles_or_fiche_revision.md',
];

function loadArticleContents(): string[] {
    return ARTICLE_CONTENT_FILES.map((relativePath) => {
        const fullPath = path.resolve(__dirname, `../${relativePath}`);
        if (!fs.existsSync(fullPath)) {
            throw new Error(`Missing article content file: ${relativePath}`);
        }
        return fs.readFileSync(fullPath, 'utf8');
    });
}

async function seedLearningResourcesFromFile(filePath: string) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const payload = JSON.parse(raw) as LearningResourceSeedFile;

    if (!Array.isArray(payload?.resources)) {
        throw new Error('Invalid learning resources seed file format.');
    }

    const articleContents = loadArticleContents();

    const seedForJob = async (job: { id: string; title: string }, resources: LearningResourceSeed[]) => {
        console.log(`\n=== Seeding learning resources for job: ${job.title} ===`);

        let articleIndex = 0;
        for (const resource of resources) {
            const type = resource.type as LearningResourceType;
            const slug = slugify(`${job.title}-${resource.title}-${resource.type}`);
            const mediaUrl = normalizeUrl(resource.url);
            const content = type === LearningResourceType.ARTICLE
                ? articleContents[articleIndex++] ?? null
                : null;

            await prisma.learningResource.upsert({
                where: { slug },
                update: {
                    scope: LearningResourceScope.JOB_DEFAULT,
                    type,
                    source: LearningResourceSource.SYSTEM_DEFAULT,
                    title: resource.title,
                    description: resource.description ?? null,
                    content,
                    mediaUrl,
                    thumbnailUrl: resource.thumbnailUrl ?? null,
                    languageCode: resource.languageCode ?? null,
                    estimatedDuration: resource.estimatedDurationSeconds ?? null,
                    metadata: {
                        url: mediaUrl,
                        provider: resource.provider ?? null,
                        relevance: resource.relevance ?? null,
                        verifiedAt: resource.verifiedAt ?? null,
                        paywalled: resource.paywalled ?? null,
                        contentSource: type === LearningResourceType.ARTICLE
                            ? ARTICLE_CONTENT_FILES[Math.max(0, articleIndex - 1)]
                            : null,
                    },
                    job: { connect: { id: job.id } },
                },
                create: {
                    scope: LearningResourceScope.JOB_DEFAULT,
                    type,
                    source: LearningResourceSource.SYSTEM_DEFAULT,
                    title: resource.title,
                    slug,
                    description: resource.description ?? null,
                    content,
                    mediaUrl,
                    thumbnailUrl: resource.thumbnailUrl ?? null,
                    languageCode: resource.languageCode ?? null,
                    estimatedDuration: resource.estimatedDurationSeconds ?? null,
                    metadata: {
                        url: mediaUrl,
                        provider: resource.provider ?? null,
                        relevance: resource.relevance ?? null,
                        verifiedAt: resource.verifiedAt ?? null,
                        paywalled: resource.paywalled ?? null,
                        contentSource: type === LearningResourceType.ARTICLE
                            ? ARTICLE_CONTENT_FILES[Math.max(0, articleIndex - 1)]
                            : null,
                    },
                    job: { connect: { id: job.id } },
                },
            });
        }

        console.log(`✓ Seeded ${resources.length} learning resources.`);
    };

    if (payload.jobFamilyName) {
        const jobFamily = await prisma.jobFamily.findFirst({
            where: { name: payload.jobFamilyName },
            select: { id: true, name: true },
        });
        if (!jobFamily) {
            throw new Error(`JobFamily not found for learning resources seed: "${payload.jobFamilyName}".`);
        }

        console.log(`\n=== Seeding learning resources for job family: ${jobFamily.name} ===`);

        let articleIndex = 0;
        for (const resource of payload.resources) {
            const type = resource.type as LearningResourceType;
            const slug = slugify(`${jobFamily.name}-${resource.title}-${resource.type}`);
            const mediaUrl = normalizeUrl(resource.url);
            const content = type === LearningResourceType.ARTICLE
                ? articleContents[articleIndex++] ?? null
                : null;

            await prisma.learningResource.upsert({
                where: { slug },
                update: {
                    scope: LearningResourceScope.JOB_DEFAULT,
                    type,
                    source: LearningResourceSource.SYSTEM_DEFAULT,
                    title: resource.title,
                    description: resource.description ?? null,
                    content,
                    mediaUrl,
                    thumbnailUrl: resource.thumbnailUrl ?? null,
                    languageCode: resource.languageCode ?? null,
                    estimatedDuration: resource.estimatedDurationSeconds ?? null,
                    metadata: {
                        url: mediaUrl,
                        provider: resource.provider ?? null,
                        relevance: resource.relevance ?? null,
                        verifiedAt: resource.verifiedAt ?? null,
                        paywalled: resource.paywalled ?? null,
                        contentSource: type === LearningResourceType.ARTICLE
                            ? ARTICLE_CONTENT_FILES[Math.max(0, articleIndex - 1)]
                            : null,
                    },
                    jobFamily: { connect: { id: jobFamily.id } },
                },
                create: {
                    scope: LearningResourceScope.JOB_DEFAULT,
                    type,
                    source: LearningResourceSource.SYSTEM_DEFAULT,
                    title: resource.title,
                    slug,
                    description: resource.description ?? null,
                    content,
                    mediaUrl,
                    thumbnailUrl: resource.thumbnailUrl ?? null,
                    languageCode: resource.languageCode ?? null,
                    estimatedDuration: resource.estimatedDurationSeconds ?? null,
                    metadata: {
                        url: mediaUrl,
                        provider: resource.provider ?? null,
                        relevance: resource.relevance ?? null,
                        verifiedAt: resource.verifiedAt ?? null,
                        paywalled: resource.paywalled ?? null,
                        contentSource: type === LearningResourceType.ARTICLE
                            ? ARTICLE_CONTENT_FILES[Math.max(0, articleIndex - 1)]
                            : null,
                    },
                    jobFamily: { connect: { id: jobFamily.id } },
                },
            });
        }

        console.log(`✓ Seeded ${payload.resources.length} learning resources for job family.`);
        return;
    }

    if (!payload.jobTitle) {
        throw new Error('Learning resources seed file must include jobTitle or jobFamilyName.');
    }

    const job = await prisma.job.findFirst({
        where: { title: payload.jobTitle },
        select: { id: true, title: true },
    });

    if (!job) {
        throw new Error(`Job not found for learning resources seed: "${payload.jobTitle}".`);
    }

    await seedForJob(job, payload.resources);
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
async function main() {
    // Langues (anglais par défaut)
    await prisma.language.upsert({
        where: { code: 'en' },
        update: { isDefault: true, name: 'English' },
        create: { code: 'en', name: 'English', isDefault: true },
    });

    await prisma.language.upsert({
        where: { code: 'fr' },
        update: { name: 'Français' },
        create: { code: 'fr', name: 'Français' },
    });

    await seedRole('UNIDENTIFIED');
    await seedRole('BASIC');
    await seedRole('PREMIUM');
    await seedRole('PROFESSIONAL');
    // await seedJob(JOB_PM);
    // await seedJob(JOB_UI);
    await seedModules();
    await seedQuestDefinitions();

    await seedBtsCiel();
    await seedBtsCielUsers();
    const learningResourcesPath = path.resolve(__dirname, '../uploads/Untitled-1.json');
    await seedLearningResourcesFromFile(learningResourcesPath);

    console.log('\nSeed completed ✅');
}

main()
    .catch((e) => {
        console.error('Seed failed ❌', e);
        process.exit(1);
    })
    .finally(async () => {
        prisma.$disconnect();
    });
