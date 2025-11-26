/*
 * Script de génération de jobs et de toutes les entités associées.
 *
 * Ce fichier constitue la première étape du plan défini dans le
 * message précédent. Il se concentre sur le squelette du script CLI,
 * la définition des options, l'initialisation du client Prisma, des
 * fonctions utilitaires de normalisation et des helpers d'upsert
 * idempotents. Aucune logique d'IA ni d'écriture de données dans la
 * base n'est encore implémentée ici – cela viendra dans les étapes
 * suivantes.
 */

import {CompetenciesFamily, Competency, JobFamily, Language} from '@prisma/client';
import {Command} from 'commander';
import slugify from 'slugify';
import {generateJobSpec, generateTranslations, validateJobSpec} from "./job-spec-generator";

// -----------------------------------------------------------------------------
//  Helpers de normalisation
//
// Ces fonctions servent à transformer les libellés saisis (job, compétences,
// familles, etc.) en versions normalisées et/ou slugifiées. La normalisation
// est utile pour éviter les doublons lors des recherches en base (par exemple
// "Développeur Web" et "developpeur web" doivent correspondre au même Job).

/**
 * Normalise une chaîne en supprimant les accents, en la passant en minuscules
 * et en retirant les caractères non alphanumériques (hors espaces et tirets).
 *
 * @param input Chaîne à normaliser
 * @returns Chaîne normalisée
 */
export function normalizeName(input: string): string {
    return input
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '') // supprime les diacritiques
        .replace(/[^a-z0-9\s-]/g, '') // supprime tout sauf alphanumérique, espace et tiret
        .replace(/\s+/g, ' ') // espaces multiples → un seul
        .trim();
}

/**
 * Transforme une chaîne en slug URL-friendly. Utilise le package slugify
 * pour respecter les conventions (caractères ASCII, tirets). Exemple :
 * "Chef de Projet" → "chef-de-projet".
 *
 * @param input Chaîne à slugifier
 * @returns Slug
 */
export function slugifyName(input: string): string {
    return slugify(input, {lower: true, strict: true});
}

// -----------------------------------------------------------------------------
//  Helpers d'upsert idempotent
//
// Ces fonctions encapsulent la logique de création ou de récupération d'objets
// existants. Elles utilisent la normalisation pour rechercher des enregistrements
// existants et créent les entrées si elles sont absentes. Elles ne gèrent pas
// encore les traductions ni les relations complexes : ces aspects seront
// implémentés ultérieurement dans le script.

/**
 * S'assure qu'une langue existe dans la table Language. Si elle n'existe pas,
 * elle est créée. Retourne l'objet Language correspondant.
 *
 * @param code Code de langue (ex: "en", "fr")
 * @param name Nom complet de la langue (facultatif)
 */
export async function ensureLanguage(code: string, name?: string): Promise<Language> {
    const lang = await prisma.language.findUnique({where: {code}});
    if (lang) return lang;
    return prisma.language.create({data: {code, name: name ?? code, isDefault: false}});
}

/**
 * Upsert d'une JobFamily. Recherche par normalizedName ; si trouvé, le
 * retourne. Sinon, crée une nouvelle JobFamily avec le nom fourni.
 *
 * @param name Nom de la famille de métier
 */
export async function upsertJobFamily(name: string): Promise<JobFamily> {
    const normalizedName = normalizeName(name);
    const existing = await prisma.jobFamily.findFirst({where: {normalizedName}});
    if (existing) {
        return existing;
    }
    return prisma.jobFamily.create({data: {name, normalizedName}});
}

/**
 * Upsert d'une CompetenciesFamily. Recherche par normalizedName ; crée si
 * nécessaire. Ne gère pas la hiérarchie (parentId) ni la description.
 *
 * @param name Nom de la famille de compétences
 */
export async function upsertCompetenciesFamily(name: string): Promise<CompetenciesFamily> {
    const normalizedName = normalizeName(name);
    const existing = await prisma.competenciesFamily.findFirst({where: {normalizedName}});
    if (existing) {
        return existing;
    }
    return prisma.competenciesFamily.create({data: {name, normalizedName, description: ' '}});
}

/**
 * Upsert d'une Competency. Recherche par normalizedName ; crée si nécessaire
 * avec les propriétés par défaut. Cette version initiale ne gère pas les
 * relations avec les familles ni les niveaux ou types personnalisés.
 *
 * @param name Nom de la compétence
 */
export async function upsertCompetency(name: string): Promise<Competency> {
    const normalizedName = normalizeName(name);
    const existing = await prisma.competency.findFirst({where: {normalizedName}});
    if (existing) {
        return existing;
    }
    return prisma.competency.create({
        data: {
            name,
            normalizedName,
            type: 'HARD_SKILL',
            level: 'EASY',
            // valeurs de score par défaut (1–5) – peuvent être ajustées par la suite
            beginnerScore: 1,
            intermediateScore: 2,
            advancedScore: 3,
            expertScore: 4,
            maxScore: 5,
        },
    });
}

/**
 * Helper pour insérer ou mettre à jour des traductions. Dans cette version
 * initiale, la fonction est un squelette qui montre l'intention sans
 * implémentation. Les translations seront gérées dans les étapes
 * ultérieures du projet.
 */
export async function upsertTranslations(/* params */): Promise<void> {
    // TODO: implémenter la logique d'insertion et de mise à jour des traductions.
    // Cette fonction devra parcourir les entrées multilingues et insérer
    // conditionnellement les enregistrements dans la table Translation en
    // fonction du paramètre force ou de l'existence préalable des traductions.
}

// -----------------------------------------------------------------------------
//  Logique CLI
//
// Configure les options de la ligne de commande et fournit un point
// d'entrée au script. La logique lourde (génération IA, persistance complète)
// sera ajoutée dans les étapes suivantes.

interface CliArgs {
    job: string;
    langs: string;
    defaultLang: string;
    dryRun: boolean;
    force: boolean;
}

async function main() {
    const program = new Command()
        .name('generate-job')
        .description('Generate a job, competency families, competencies, and a positioning quiz with translations.')
        .requiredOption('--job <string>', 'Job name (e.g. "UI Designer")')
        .option('--langs <list>', 'Comma-separated languages (e.g. "en,fr")', 'en')
        .option('--defaultLang <string>', 'Pivot language', 'en')
        .option('--dry-run', 'Do not write to DB; print plan only', false)
        .option('--force', 'Overwrite existing translations', false);

    program.parse(process.argv);
    const opts = program.opts<{
        job: string;
        langs: string;
        defaultLang: string;
        dryRun: boolean;
        force: boolean;
    }>();

    const job = opts.job;
    const langsList = opts.langs.split(',').map(s => s.trim()).filter(Boolean);
    const defaultLang = opts.defaultLang;
    const dryRun = !!opts.dryRun;
    const force = !!opts.force;

    console.log('--- Params ---');
    console.log('Job:', job);
    console.log('Langs:', langsList.join(', '));
    console.log('Default lang:', defaultLang);
    console.log('Dry run:', dryRun);
    console.log('Force:', force);

    // Exemple d'utilisation des helpers :
    const normalizedJob = normalizeName(job);
    console.log('Nom normalisé :', normalizedJob);
    const slug = slugifyName(job);
    console.log('Slug :', slug);

    // Vérifier que les langues existent dans la table Language
    for (const code of langsList) {
        await ensureLanguage(code);
    }

    // Upsert de la JobFamily correspondant au job si pertinente. Dans cette
    // version initiale, on utilise simplement le nom du job pour la famille.
    // Dans les étapes suivantes, la génération IA déterminera la bonne famille.
    const jobFamily = await upsertJobFamily(job);
    console.log('JobFamily créé ou récupéré :', jobFamily);

    // TODO: Implémenter la suite du flux (génération IA, création des compétences,
    //  familles de compétences, quiz, traductions, etc.)
    // après avoir récupéré job, langsList et defaultLang depuis la CLI
    const spec = await generateJobSpec(job, defaultLang);
    validateJobSpec(spec);  // lève une erreur si le quiz est incohérent
    const translations = await generateTranslations(spec, langsList, defaultLang);

    // Nettoyage : si dry-run, ne pas continuer plus loin.
    if (dryRun) {
        console.log('--- Aperçu JobSpec ---');
        console.dir(spec, {depth: null});
        console.log('--- Aperçu Translations ---');
        console.dir(translations, {depth: null});
        await prisma.$disconnect();
        return;
    }

    const result = await persistJobSpec(spec, translations, langsList, defaultLang, force);
    console.log('Création/actualisation terminée, jobId :', result.jobId);

    await prisma.$disconnect();
}

// Exécute main() et capture les erreurs pour un affichage clair
main().catch((error) => {
    console.error('Erreur lors de la génération :', error);
    prisma.$disconnect().catch(() => {
    });
    process.exit(1);
});