/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function slugify(input: string): string {
    return input
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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
    name: string;
    kind: Kind;
    level: Level;       // utilisé pour le fallback
    subfamily: string;  // 1 des sous-familles
    scores?: Scores;    // override facultatif par compétence
};

type FamilyBlock = {
    family: string;                 // 1 mot
    subfamilies: [string, string];  // max 2, 1 mot chacune
    items: CompetencyItem[];        // 10
};

type RoleBlock = {
    jobFamilyName: string;          // ex. "Produit", "Design"
    jobTitle: string;               // ex. "Product Manager", "UI Designer"
    blocks: FamilyBlock[];          // 5 familles * 10
};

// -----------------------------------------------------------------------------
// Fallback de scores par niveau (modifie si tu veux une autre politique)
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
            `b:${s.beginner} i:${s.intermediate} a:${s.advanced} e:${s.expert} m:${s.max}`
        );
    }
    if (s.beginner < 0 || s.max < 1) {
        throw new Error(`Scores out of range for "${item.name}"`);
    }
    return s;
}

// -----------------------------------------------------------------------------
// Données Product Manager (quelques overrides d’exemple inclus)
// -----------------------------------------------------------------------------
const ROLE_PM: RoleBlock = {
    jobFamilyName: 'Produit',
    jobTitle: 'Product Manager',
    blocks: [
        {
            family: 'Stratégie',
            subfamilies: ['Vision', 'Marché'],
            items: [
                // Exemple override = max = 4 + palier médian aplati
                { name: 'Vision',         kind: 'Savoir-être',  level: 'Difficile', subfamily: 'Vision',
                    scores: { beginner: 2, intermediate: 3, advanced: 3, expert: 4, max: 4 } },
                { name: 'Priorisation',   kind: 'Savoir-faire', level: 'Difficile', subfamily: 'Vision' },
                { name: 'Alignement',     kind: 'Savoir-être',  level: 'Moyen',     subfamily: 'Vision' },
                { name: 'Objectifs',      kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Vision' },
                { name: 'Positionnement', kind: 'Savoir-faire', level: 'Difficile', subfamily: 'Vision' },
                { name: 'Segmentation',   kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Marché' },
                { name: 'Concurrence',    kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Marché' },
                { name: 'Pricing',        kind: 'Savoir-faire', level: 'Difficile', subfamily: 'Marché',
                    scores: { beginner: 2, intermediate: 3, advanced: 4, expert: 4, max: 5 } },
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
                { name: 'Release',        kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Roadmap',
                    scores: { beginner: 1, intermediate: 2, advanced: 3, expert: 3, max: 4 } },
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
                { name: 'Modélisation',    kind: 'Savoir-faire', level: 'Difficile', subfamily: 'Analyse',
                    scores: { beginner: 2, intermediate: 3, advanced: 4, expert: 5, max: 5 } },
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
                { name: 'Feedback',      kind: 'Savoir-être',  level: 'Moyen',     subfamily: 'Communication',
                    scores: { beginner: 1, intermediate: 2, advanced: 2, expert: 3, max: 4 } },
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
// Données UI Designer (avec quelques overrides d’exemple)
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
                { name: 'Espacement',    kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Layout',
                    scores: { beginner: 1, intermediate: 2, advanced: 3, expert: 3, max: 4 } },
                { name: 'Réactivité',    kind: 'Savoir-faire', level: 'Difficile', subfamily: 'Layout' },
                { name: 'Empathie',      kind: 'Savoir-être',  level: 'Moyen',     subfamily: 'Layout' },
                { name: 'Composants',    kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Composants' },
                { name: 'États',         kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Composants' },
                { name: 'Variants',      kind: 'Savoir-faire', level: 'Difficile', subfamily: 'Composants' },
                { name: 'Navigation',    kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Composants' },
                { name: 'Rigueur',       kind: 'Savoir-être',  level: 'Difficile', subfamily: 'Composants',
                    scores: { beginner: 2, intermediate: 3, advanced: 4, expert: 4, max: 5 } },
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
                { name: 'Lisibilité',    kind: 'Savoir-faire', level: 'Moyen',     subfamily: 'Typo',
                    scores: { beginner: 1, intermediate: 2, advanced: 3, expert: 4, max: 5 } },
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
                { name: 'Curiosité',     kind: 'Savoir-être',  level: 'Moyen',     subfamily: 'Figma',
                    scores: { beginner: 1, intermediate: 2, advanced: 2, expert: 3, max: 4 } },
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
                { name: 'Alignement',    kind: 'Savoir-être',  level: 'Difficile', subfamily: 'Gestion',
                    scores: { beginner: 2, intermediate: 3, advanced: 4, expert: 4, max: 5 } },
            ],
        },
    ],
};

// -----------------------------------------------------------------------------
// Upserts
// -----------------------------------------------------------------------------
async function upsertFamily(name: string, parentId?: string | null) {
    const normalizedName = slugify(name);
    const base = {
        name,
        normalizedName,
        description: null as string | null,
        parentId: parentId ?? null,
        updatedAt: new Date(),
    };
    return prisma.competenciesFamily.upsert({
        where: { name },
        update: base,
        create: { ...base, createdAt: new Date() },
    });
}

async function upsertCompetencyWithScores(name: string, s: Scores) {
    const normalizedName = slugify(name);
    return prisma.competency.upsert({
        where: { name },
        update: {
            normalizedName,
            beginnerScore: s.beginner,
            intermediateScore: s.intermediate,
            advancedScore: s.advanced,
            expertScore: s.expert,
            maxScore: s.max,
            updatedAt: new Date(),
        },
        create: {
            name,
            normalizedName,
            beginnerScore: s.beginner,
            intermediateScore: s.intermediate,
            advancedScore: s.advanced,
            expertScore: s.expert,
            maxScore: s.max,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });
}

async function upsertJobFamily(name: string) {
    return prisma.jobFamily.upsert({
        where: { name },
        update: { normalizedName: slugify(name), updatedAt: new Date() },
        create: {
            name,
            normalizedName: slugify(name),
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });
}

async function upsertJob(jobFamilyId: string, title: string, description?: string | null) {
    const existing = await prisma.job.findFirst({ where: { title, jobFamilyId } });
    if (existing) {
        return prisma.job.update({
            where: { id: existing.id },
            data: {
                normalizedName: slugify(title),
                description: description ?? existing.description,
                isActive: true,
                updatedAt: new Date(),
            },
        });
    }
    return prisma.job.create({
        data: {
            jobFamilyId,
            title,
            normalizedName: slugify(title),
            description: description ?? null,
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
// Seeding d’un rôle (familles/sous-familles, compétences, job, relations)
// -----------------------------------------------------------------------------
async function seedRole(role: RoleBlock) {
    console.log(`\n=== Seeding role: ${role.jobTitle} ===`);

    // 1) Families + subfamilies
    const familyIds = new Set<string>();            // pour relier le Job -> familles
    const familyMap = new Map<string, string>();    // familyName -> id
    const subfamilyMap = new Map<string, string>(); // "family:sub" -> id

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

    // 2) Competencies + liens familles/sous-familles
    const competencyIds: string[] = [];

    for (const block of role.blocks) {
        const famId = familyMap.get(block.family)!;

        for (const item of block.items) {
            const scores = mergeAndValidateScores(item);
            const comp = await upsertCompetencyWithScores(item.name, scores);
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

    // 3) JobFamily + Job
    const jf = await upsertJobFamily(role.jobFamilyName);
    const job = await upsertJob(
        jf.id,
        role.jobTitle,
        role.jobTitle === 'Product Manager'
            ? 'Responsable stratégie et cycle produit'
            : 'Conçoit l’interface et le système visuel'
    );

    // 4) Relier Job -> Competencies (JobCompetencies) et Job -> CompetenciesFamily (JobCompetenciesFamilies)
    await prisma.job.update({
        where: { id: job.id },
        data: {
            competencies: {
                connect: competencyIds.map((id) => ({ id })),
            },
            competenciesFamilies: {
                connect: Array.from(familyIds).map((id) => ({ id })), // familles + sous-familles utilisées
            },
        },
    });

    console.log(`✓ ${role.jobTitle}: ${competencyIds.length} compétences, ${familyIds.size} familles liées`);
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
async function main() {
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
