import { Prisma, PrismaClient, JobProgressionLevel } from '@prisma/client';
import path from 'node:path';
import xlsx from 'xlsx';

const prisma = new PrismaClient();

const JOB_FAMILY_NAME = 'BTS Ciel';
const EDLAB_DIR = path.resolve(__dirname, '..', 'edlab');
const DIAGRAMS_FILE = path.join(EDLAB_DIR, 'edlab-base_diagrams.xlsx');

type DiagramRow = {
    jobTitle: string;
    familyName: string;
    level: JobProgressionLevel;
    value: Prisma.Decimal;
};

function slugify(input: string): string {
    return input
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
}

function normalizeString(value: unknown): string {
    return String(value ?? '').trim();
}

function mapProgressionLevel(value: string): JobProgressionLevel | null {
    switch ((value || '').toLowerCase()) {
        case 'debutant':
        case 'débutant':
            return JobProgressionLevel.BEGINNER;
        case 'junior':
            return JobProgressionLevel.JUNIOR;
        case 'intermédiaire':
        case 'intermediaire':
            return JobProgressionLevel.MIDLEVEL;
        case 'senior':
            return JobProgressionLevel.SENIOR;
        case 'expert':
            return JobProgressionLevel.SENIOR;
        default:
            return null;
    }
}

function loadDiagrams(): DiagramRow[] {
    const wb = xlsx.readFile(DIAGRAMS_FILE);
    const rows: DiagramRow[] = [];

    for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null });
        for (const row of data) {
            const jobTitle = normalizeString(row['Métier'] ?? sheetName);
            const familyName = normalizeString(row['Famille']);
            const levelRaw = normalizeString(row['Niveau']);
            const value = row['Valeur'];
            if (!jobTitle || !familyName || !levelRaw || value == null) continue;

            const level = mapProgressionLevel(levelRaw);
            if (!level) {
                console.warn(`[skip] Niveau inconnu: "${levelRaw}" (job=${jobTitle}, family=${familyName})`);
                continue;
            }

            rows.push({
                jobTitle,
                familyName,
                level,
                value: new Prisma.Decimal(Number(value)),
            });
        }
    }

    return rows;
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');

    const diagrams = loadDiagrams();
    if (!diagrams.length) {
        console.log('Aucune ligne valide dans edlab-base_diagrams.xlsx.');
        return;
    }

    const jobFamily = await prisma.jobFamily.findUnique({
        where: { name: JOB_FAMILY_NAME },
        select: { id: true },
    });

    if (!jobFamily) {
        throw new Error(`JobFamily introuvable: ${JOB_FAMILY_NAME}`);
    }

    const jobSlugs = Array.from(new Set(diagrams.map((row) => slugify(row.jobTitle))));
    const jobs = await prisma.job.findMany({
        where: { slug: { in: jobSlugs } },
        select: { id: true, slug: true, jobFamilyId: true },
    });
    const jobBySlug = new Map(jobs.map((job) => [job.slug, job]));

    const familyNames = Array.from(new Set(diagrams.map((row) => row.familyName)));
    const families = await prisma.competenciesFamily.findMany({
        where: { name: { in: familyNames } },
        select: { id: true, name: true },
    });
    const familyByName = new Map(families.map((family) => [family.name, family]));

    let updated = 0;
    let created = 0;
    let skipped = 0;

    for (const row of diagrams) {
        const jobSlug = slugify(row.jobTitle);
        const job = jobBySlug.get(jobSlug);
        if (!job) {
            console.warn(`[skip] Job introuvable: ${row.jobTitle} (slug=${jobSlug})`);
            skipped += 1;
            continue;
        }
        if (job.jobFamilyId !== jobFamily.id) {
            console.warn(`[skip] Job hors famille "${JOB_FAMILY_NAME}": ${row.jobTitle}`);
            skipped += 1;
            continue;
        }

        const family = familyByName.get(row.familyName);
        if (!family) {
            console.warn(`[skip] Famille introuvable: ${row.familyName}`);
            skipped += 1;
            continue;
        }

        const data = {
            rawScore0to10: Number(row.value) * 2,
            radarScore0to5: Number(row.value),
            continuous0to10: Number(row.value) * 2,
            masteryAvg0to1: Number(row.value) / 5,
            updatedAt: new Date(),
        };

        if (dryRun) {
            console.log(`[dry-run] upsert job=${job.slug} family=${row.familyName} level=${row.level} value=${row.value}`);
            continue;
        }

        const existing = await prisma.jobKiviat.findUnique({
            where: {
                jobId_competenciesFamilyId_level: {
                    jobId: job.id,
                    competenciesFamilyId: family.id,
                    level: row.level,
                },
            },
            select: { id: true },
        });

        await prisma.jobKiviat.upsert({
            where: {
                jobId_competenciesFamilyId_level: {
                    jobId: job.id,
                    competenciesFamilyId: family.id,
                    level: row.level,
                },
            },
            update: data,
            create: {
                jobId: job.id,
                competenciesFamilyId: family.id,
                level: row.level,
                ...data,
            },
        });

        if (existing) {
            updated += 1;
        } else {
            created += 1;
        }
    }

    console.log(`Terminé. updated=${updated} created=${created} skipped=${skipped}`);
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
