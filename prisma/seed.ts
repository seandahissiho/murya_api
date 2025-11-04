/* eslint-disable no-console */
import { CompetencyType, PrismaClient } from '@prisma/client';

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
type Level = 'Facile' | 'Moyen' | 'Difficile' | 'Expert';

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

type RoleBlock = {
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

    // Families & subfamilies ROLE_PM
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

    // Families & subfamilies ROLE_UI
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

    // Competencies ROLE_PM
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

    // Competencies ROLE_UI
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

// -----------------------------------------------------------------------------
// Fallback de scores par niveau
// -----------------------------------------------------------------------------
function defaultScoresForLevel(level: Level): Scores {
    switch (level) {
        case 'Facile':     return { beginner: 1, intermediate: 1, advanced: 2, expert: 3, max: 4 };
        case 'Moyen':      return { beginner: 1, intermediate: 2, advanced: 3, expert: 4, max: 5 };
        case 'Difficile':  return { beginner: 2, intermediate: 3, advanced: 4, expert: 4, max: 5 };
        case 'Expert':     return { beginner: 2, intermediate: 3, advanced: 4, expert: 5, max: 5 };
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
const ROLE_PM: RoleBlock = {
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
                    level: 'Difficile',
                    subfamily: 'Vision',
                    scores: { beginner: 2, intermediate: 3, advanced: 3, expert: 4, max: 4 },
                },
                { name: 'Priorisation',   kind: 'Savoir-faire', level: 'Difficile', subfamily: 'Vision' },
                { name: 'Alignement',     kind: 'Savoir-être',  level: 'Moyen',     subfamily: 'Vision' },
                { name: 'Objectifs',      kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Vision' },
                { name: 'Positionnement', kind: 'Savoir-faire', level: 'Difficile', subfamily: 'Vision' },
                { name: 'Segmentation',   kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Marché' },
                { name: 'Concurrence',    kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Marché' },
                {
                    name: 'Pricing',
                    kind: 'Savoir-faire',
                    level: 'Difficile',
                    subfamily: 'Marché',
                    scores: { beginner: 2, intermediate: 3, advanced: 4, expert: 4, max: 5 },
                },
                { name: 'Partenariats',   kind: 'Savoir-être',  level: 'Difficile', subfamily: 'Marché' },
                { name: 'GoToMarket',     kind: 'Savoir-faire', level: 'Difficile', subfamily: 'Marché' },
            ],
        },
        {
            family: 'Produit',
            subfamilies: ['Roadmap', 'Découverte'],
            items: [
                { name: 'Planification',  kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Roadmap' },
                { name: 'Dépendances',    kind: 'Savoir-faire', level: 'Difficile', subfamily: 'Roadmap' },
                {
                    name: 'Release',
                    kind: 'Savoir-faire',
                    level: 'Moyen',
                    subfamily: 'Roadmap',
                    scores: { beginner: 1, intermediate: 2, advanced: 3, expert: 3, max: 4 },
                },
                { name: 'Estimation',     kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Roadmap' },
                { name: 'Backlog',        kind: 'Savoir-faire', level: 'Facile',    subfamily: 'Roadmap' },
                { name: 'Hypothèses',     kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Découverte' },
                { name: 'Entretiens',     kind: 'Savoir-être',  level: 'Moyen',     subfamily: 'Découverte' },
                { name: 'Personas',       kind: 'Savoir-faire', level: 'Facile',    subfamily: 'Découverte' },
                { name: 'Prototypage',    kind: 'Savoir-faire', level: 'Facile',    subfamily: 'Découverte' },
                { name: 'Tests',          kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Découverte' },
            ],
        },
        {
            family: 'Données',
            subfamilies: ['Analyse', 'Mesure'],
            items: [
                { name: 'SQL',             kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Analyse' },
                { name: 'Tableaux',        kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Analyse' },
                { name: 'Cohortes',        kind: 'Savoir-faire', level: 'Difficile', subfamily: 'Analyse' },
                { name: 'A/B',             kind: 'Savoir-faire', level: 'Difficile', subfamily: 'Analyse' },
                {
                    name: 'Modélisation',
                    kind: 'Savoir-faire',
                    level: 'Difficile',
                    subfamily: 'Analyse',
                    scores: { beginner: 2, intermediate: 3, advanced: 4, expert: 5, max: 5 },
                },
                { name: 'KPI',             kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Mesure' },
                { name: 'Instrumentation', kind: 'Savoir-faire', level: 'Difficile', subfamily: 'Mesure' },
                { name: 'Attribution',     kind: 'Savoir-faire', level: 'Difficile', subfamily: 'Mesure' },
                { name: 'Rétention',       kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Mesure' },
                { name: 'Monétisation',    kind: 'Savoir-être',  level: 'Difficile', subfamily: 'Mesure' },
            ],
        },
        {
            family: 'Design',
            subfamilies: ['UX', 'Recherche'],
            items: [
                { name: 'Parcours',       kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'UX' },
                { name: 'Accessibilité',  kind: 'Savoir-faire', level: 'Difficile', subfamily: 'UX' },
                { name: 'Microcopies',    kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'UX' },
                { name: 'Information',    kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'UX' },
                { name: 'Interaction',    kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'UX' },
                { name: 'Méthodes',       kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Recherche' },
                { name: 'Guides',         kind: 'Savoir-faire', level: 'Facile',    subfamily: 'Recherche' },
                { name: 'Synthèse',       kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Recherche' },
                { name: 'Insight',        kind: 'Savoir-être',  level: 'Difficile', subfamily: 'Recherche' },
                { name: 'Journaux',       kind: 'Savoir-faire', level: 'Facile',    subfamily: 'Recherche' },
            ],
        },
        {
            family: 'Leadership',
            subfamilies: ['Communication', 'Équipe'],
            items: [
                { name: 'Storytelling',  kind: 'Savoir-être',  level: 'Difficile', subfamily: 'Communication' },
                { name: 'Négociation',   kind: 'Savoir-être',  level: 'Difficile', subfamily: 'Communication' },
                {
                    name: 'Feedback',
                    kind: 'Savoir-être',
                    level: 'Moyen',
                    subfamily: 'Communication',
                    scores: { beginner: 1, intermediate: 2, advanced: 2, expert: 3, max: 4 },
                },
                { name: 'Conflits',      kind: 'Savoir-être',  level: 'Difficile', subfamily: 'Communication' },
                { name: 'Influence',     kind: 'Savoir-être',  level: 'Difficile', subfamily: 'Communication' },
                { name: 'Mentorat',      kind: 'Savoir-être',  level: 'Moyen',     subfamily: 'Équipe' },
                { name: 'Recrutement',   kind: 'Savoir-faire', level: 'Difficile', subfamily: 'Équipe' },
                { name: 'Culture',       kind: 'Savoir-être',  level: 'Moyen',     subfamily: 'Équipe' },
                { name: 'Délégation',    kind: 'Savoir-être',  level: 'Moyen',     subfamily: 'Équipe' },
                { name: 'Priorités',     kind: 'Savoir-être',  level: 'Difficile', subfamily: 'Équipe' },
            ],
        },
    ],
};

// -----------------------------------------------------------------------------
// Données UI Designer
// -----------------------------------------------------------------------------
const ROLE_UI: RoleBlock = {
    jobFamilyName: 'Design',
    jobTitle: 'UI Designer',
    blocks: [
        {
            family: 'Interface',
            subfamilies: ['Layout', 'Composants'],
            items: [
                { name: 'Grille',        kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Layout' },
                { name: 'Hiérarchie',    kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Layout' },
                {
                    name: 'Espacement',
                    kind: 'Savoir-faire',
                    level: 'Moyen',
                    subfamily: 'Layout',
                    scores: { beginner: 1, intermediate: 2, advanced: 3, expert: 3, max: 4 },
                },
                { name: 'Réactivité',    kind: 'Savoir-faire', level: 'Difficile', subfamily: 'Layout' },
                { name: 'Empathie',      kind: 'Savoir-être',  level: 'Moyen',     subfamily: 'Layout' },
                { name: 'Composants',    kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Composants' },
                { name: 'États',         kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Composants' },
                { name: 'Variants',      kind: 'Savoir-faire', level: 'Difficile', subfamily: 'Composants' },
                { name: 'Navigation',    kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Composants' },
                {
                    name: 'Rigueur',
                    kind: 'Savoir-être',
                    level: 'Difficile',
                    subfamily: 'Composants',
                    scores: { beginner: 2, intermediate: 3, advanced: 4, expert: 4, max: 5 },
                },
            ],
        },
        {
            family: 'Visuel',
            subfamilies: ['Couleurs', 'Typo'],
            items: [
                { name: 'Palette',       kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Couleurs' },
                { name: 'Contraste',     kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Couleurs' },
                { name: 'Harmonie',      kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Couleurs' },
                { name: 'Marque',        kind: 'Savoir-faire', level: 'Difficile', subfamily: 'Couleurs' },
                { name: 'Sensibilité',   kind: 'Savoir-être',  level: 'Moyen',     subfamily: 'Couleurs' },
                { name: 'Échelle',       kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Typo' },
                {
                    name: 'Lisibilité',
                    kind: 'Savoir-faire',
                    level: 'Moyen',
                    subfamily: 'Typo',
                    scores: { beginner: 1, intermediate: 2, advanced: 3, expert: 4, max: 5 },
                },
                { name: 'Interlignage',  kind: 'Savoir-faire', level: 'Facile',    subfamily: 'Typo' },
                { name: 'Glyphes',       kind: 'Savoir-faire', level: 'Facile',    subfamily: 'Typo' },
                { name: 'Esthétique',    kind: 'Savoir-être',  level: 'Difficile', subfamily: 'Typo' },
            ],
        },
        {
            family: 'Système',
            subfamilies: ['Designkit', 'Tokens'],
            items: [
                { name: 'Bibliothèque',  kind: 'Savoir-faire', level: 'Difficile', subfamily: 'Designkit' },
                { name: 'Nomenclature',  kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Designkit' },
                { name: 'Versioning',    kind: 'Savoir-faire', level: 'Difficile', subfamily: 'Designkit' },
                { name: 'Documentation', kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Designkit' },
                { name: 'Exigence',      kind: 'Savoir-être',  level: 'Difficile', subfamily: 'Designkit' },
                { name: 'Couleurs',      kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Tokens' },
                { name: 'Typo',          kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Tokens' },
                { name: 'Espaces',       kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Tokens' },
                { name: 'Rayons',        kind: 'Savoir-faire', level: 'Facile',    subfamily: 'Tokens' },
                { name: 'Discipline',    kind: 'Savoir-être',  level: 'Difficile', subfamily: 'Tokens' },
            ],
        },
        {
            family: 'Prototypage',
            subfamilies: ['Figma', 'Tests'],
            items: [
                { name: 'AutoLayout',    kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Figma' },
                { name: 'Interactions',  kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Figma' },
                { name: 'Composants',    kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Figma' },
                { name: 'Variants',      kind: 'Savoir-faire', level: 'Difficile', subfamily: 'Figma' },
                {
                    name: 'Curiosité',
                    kind: 'Savoir-être',
                    level: 'Moyen',
                    subfamily: 'Figma',
                    scores: { beginner: 1, intermediate: 2, advanced: 2, expert: 3, max: 4 },
                },
                { name: 'Usabilité',     kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Tests' },
                { name: 'Scénarios',     kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Tests' },
                { name: 'Parcours',      kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Tests' },
                { name: 'Itérations',    kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Tests' },
                { name: 'Patience',      kind: 'Savoir-être',  level: 'Moyen',     subfamily: 'Tests' },
            ],
        },
        {
            family: 'Collaboration',
            subfamilies: ['Handoff', 'Gestion'],
            items: [
                { name: 'Specs',         kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Handoff' },
                { name: 'Redlines',      kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Handoff' },
                { name: 'Assets',        kind: 'Savoir-faire', level: 'Facile',    subfamily: 'Handoff' },
                { name: 'Export',        kind: 'Savoir-faire', level: 'Facile',    subfamily: 'Handoff' },
                { name: 'Clarté',        kind: 'Savoir-être',  level: 'Moyen',     subfamily: 'Handoff' },
                { name: 'Feedback',      kind: 'Savoir-être',  level: 'Moyen',     subfamily: 'Gestion' },
                { name: 'Planning',      kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Gestion' },
                { name: 'Priorités',     kind: 'Savoir-être',  level: 'Moyen',     subfamily: 'Gestion' },
                { name: 'Ateliers',      kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Gestion' },
                {
                    name: 'Alignement',
                    kind: 'Savoir-être',
                    level: 'Difficile',
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
    const normalizedName = slugify(nameFr);
    const base = {
        name: nameFr,
        normalizedName,
        description: null as string | null,
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

async function upsertCompetencyWithScores(nameFr: string, s: Scores, kind: string) {
    const normalizedName = slugify(nameFr);
    const competency = await prisma.competency.upsert({
        where: { name: nameFr },
        update: {
            normalizedName,
            beginnerScore: s.beginner,
            intermediateScore: s.intermediate,
            advancedScore: s.advanced,
            expertScore: s.expert,
            maxScore: s.max,
            updatedAt: new Date(),
            type: kind === 'Savoir-faire' ? CompetencyType.HARD_SKILL : CompetencyType.SOFT_SKILL,
        },
        create: {
            name: nameFr,
            normalizedName,
            beginnerScore: s.beginner,
            intermediateScore: s.intermediate,
            advancedScore: s.advanced,
            expertScore: s.expert,
            maxScore: s.max,
            type: kind === 'Savoir-faire' ? CompetencyType.HARD_SKILL : CompetencyType.SOFT_SKILL,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const nameEn = toEn(nameFr);
    await createBiLangTranslation('Competency', competency.id, 'name', nameEn, nameFr);

    return competency;
}

async function upsertJobFamily(nameFr: string) {
    const jf = await prisma.jobFamily.upsert({
        where: { name: nameFr },
        update: { normalizedName: slugify(nameFr), updatedAt: new Date() },
        create: {
            name: nameFr,
            normalizedName: slugify(nameFr),
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    const nameEn = toEn(nameFr);
    await createBiLangTranslation('JobFamily', jf.id, 'name', nameEn, nameFr);

    return jf;
}

async function upsertJob(jobFamilyId: string, titleEn: string, descriptionFr?: string | null) {
    const existing = await prisma.job.findFirst({ where: { title: titleEn, jobFamilyId } });
    if (existing) {
        return prisma.job.update({
            where: { id: existing.id },
            data: {
                normalizedName: slugify(titleEn),
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
            normalizedName: slugify(titleEn),
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
async function seedRole(role: RoleBlock) {
    console.log(`\n=== Seeding role: ${role.jobTitle} ===`);

    // Families + subfamilies
    const familyIds = new Set<string>();
    const familyMap = new Map<string, string>();
    const subfamilyMap = new Map<string, string>();

    for (const block of role.blocks) {
        const fam = await upsertFamily(block.family);
        familyMap.set(block.family, fam.id);
        familyIds.add(fam.id);

        for (const sub of block.subfamilies) {
            const subFam = await upsertFamily(sub, fam.id);
            subfamilyMap.set(`${block.family}:${sub}`, subFam.id);
            familyIds.add(subFam.id);
        }
    }

    // Competencies
    const competencyIds: string[] = [];

    for (const block of role.blocks) {
        const famId = familyMap.get(block.family)!;

        for (const item of block.items) {
            const scores = mergeAndValidateScores(item);
            const comp = await upsertCompetencyWithScores(item.name, scores, item.kind);
            competencyIds.push(comp.id);

            const subId = subfamilyMap.get(`${block.family}:${item.subfamily}`)!;

            await prisma.competency.update({
                where: { id: comp.id },
                data: {
                    families: {
                        connect: [{ id: famId }, { id: subId }],
                    },
                },
            });
        }
    }

    // JobFamily + Job
    const jf = await upsertJobFamily(role.jobFamilyName);

    const titleEn = role.jobTitle;
    const titleFr = JOB_TITLE_FR[role.jobTitle] ?? role.jobTitle;

    let descriptionFr: string;
    let descriptionEn: string;

    if (role.jobTitle === 'Product Manager') {
        descriptionFr = "Le Product Manager est responsable de la vision, de la stratégie et de la réussite du produit.\n" +
            "Il travaille à l’intersection du business, de la technologie et du design pour créer une solution qui apporte une réelle valeur aux utilisateurs.\n" +
            "Son rôle consiste à comprendre les besoins du marché et à les transformer en objectifs clairs et réalisables.\n" +
            "Il définit la feuille de route produit, priorise les fonctionnalités et s’assure que chaque décision contribue à la mission de l’entreprise.\n" +
            "Le PM collabore étroitement avec les équipes techniques, design et marketing pour coordonner le développement et le lancement du produit.\n" +
            "Il analyse les données d’usage et les retours clients afin d’ajuster la stratégie et d’améliorer en continu la performance.\n" +
            "Le Product Manager doit être capable de prendre des décisions rapides basées sur la donnée et la vision long terme.\n" +
            "Il fixe les indicateurs clés de succès (KPIs) et mesure régulièrement leur évolution.\n" +
            "Il veille également à la cohérence de l’expérience sur tous les canaux — web, mobile et autres interfaces.\n" +
            "Le PM agit comme la voix du client, défend ses besoins et s’assure que le produit réponde à de vraies attentes.\n" +
            "Son objectif final est de construire un produit durable, utile et aligné avec les ambitions stratégiques de l’entreprise.\n" +
            "C’est un rôle d’équilibre entre vision, exécution et communication.";
        descriptionEn = "The Product Manager is responsible for the vision, strategy, and overall success of the product.\n" +
            "They operate at the crossroads of business, technology, and design to build a solution that truly delivers value.\n" +
            "Their mission is to understand market and user needs and turn them into clear, actionable goals.\n" +
            "They define the product roadmap, prioritize features, and ensure every decision supports the company’s mission.\n" +
            "The PM works closely with engineering, design, and marketing teams to coordinate development and launches.\n" +
            "They analyze usage data and customer feedback to refine strategy and continuously improve performance.\n" +
            "A Product Manager must be able to make fast, data-informed decisions while keeping a long-term vision.\n" +
            "They establish key success indicators (KPIs) and monitor progress toward them.\n" +
            "They also ensure consistency across all user touchpoints — web, mobile, and beyond.\n" +
            "The PM acts as the customer’s voice, advocating for user needs and real-world impact.\n" +
            "Their ultimate goal is to build a product that is sustainable, useful, and strategically aligned.\n" +
            "It’s a role that balances vision, execution, and communication.";
    } else {
        descriptionFr = "Le UI Designer conçoit l’interface visuelle du produit et façonne son identité graphique.\n" +
            "Il traduit les besoins des utilisateurs et les objectifs business en expériences visuelles claires, harmonieuses et engageantes.\n" +
            "Son rôle consiste à créer des interfaces intuitives, modernes et cohérentes sur toutes les plateformes.\n" +
            "Il collabore avec les UX Designers pour transformer les parcours utilisateurs en maquettes détaillées et fonctionnelles.\n" +
            "Le UI Designer travaille également avec les développeurs afin de garantir la fidélité du rendu final et la qualité de l’expérience.\n" +
            "Il définit le design system, la palette de couleurs, la typographie et la hiérarchie visuelle du produit.\n" +
            "Le designer veille à maintenir une cohérence forte entre les composants et les interactions.\n" +
            "Il s’assure que chaque élément visuel ait une fonction claire et renforce la compréhension de l’utilisateur.\n" +
            "Le UI Designer contribue à rendre le produit accessible, esthétique et agréable à utiliser au quotidien.\n" +
            "Il suit les tendances graphiques du moment tout en gardant une approche durable et cohérente avec la marque.\n" +
            "C’est un rôle créatif et rigoureux qui allie sens du détail, empathie et compréhension des contraintes techniques.\n" +
            "Son objectif : rendre le produit à la fois beau, fonctionnel et mémorable.";
        descriptionEn = "The UI Designer is responsible for crafting the product’s visual interface and defining its graphic identity.\n" +
            "They translate user needs and business goals into clear, consistent, and engaging visual experiences.\n" +
            "Their mission is to design intuitive, modern, and coherent interfaces across all platforms.\n" +
            "They collaborate with UX Designers to transform user journeys into detailed, functional mockups.\n" +
            "The UI Designer also works with developers to ensure high visual fidelity and seamless user experience.\n" +
            "They define the design system, color palette, typography, and visual hierarchy of the product.\n" +
            "The designer maintains strong consistency across all visual components and interactions.\n" +
            "They make sure every element serves a clear purpose and supports usability.\n" +
            "The UI Designer helps make the product accessible, attractive, and enjoyable to use every day.\n" +
            "They stay up to date with visual trends while ensuring long-term consistency with the brand identity.\n" +
            "This role combines creativity, precision, and a deep understanding of technical constraints.\n" +
            "Their goal is to make the product both beautiful, functional, and memorable.";
    }

    const job = await upsertJob(jf.id, titleEn, descriptionFr);

    // Traductions Job (title + description)
    await createBiLangTranslation('Job', job.id, 'title', titleEn, titleFr);
    await createBiLangTranslation('Job', job.id, 'description', descriptionEn, descriptionFr);

    // Relier Job -> Competencies & Families
    await prisma.job.update({
        where: { id: job.id },
        data: {
            competencies: {
                connect: competencyIds.map((id) => ({ id })),
            },
            competenciesFamilies: {
                connect: Array.from(familyIds).map((id) => ({ id })),
            },
        },
    });

    console.log(`✓ ${role.jobTitle}: ${competencyIds.length} compétences, ${familyIds.size} familles liées`);
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

    await seedRole(ROLE_PM);
    await seedRole(ROLE_UI);

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
