import path from "path";
import fs from "fs";
import * as XLSX from "xlsx";
import {CompetencyType, Job} from "@prisma/client";
import { prisma } from "../src/config/db";

const OUTPUT_DIR = path.join(__dirname, "..", "data_center");
const OUTPUT_XLSX_PATH = path.join(OUTPUT_DIR, "jobs_with_competencies.xlsx");

// Nettoyage du titre de métier pour les noms de fichiers (CSV)
function slugifyJobTitle(title: string): string {
    return title
        .normalize("NFD")                        // retire les accents
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")            // remplace espaces & spéciaux par "_"
        .replace(/^_+|_+$/g, "");               // trim "_"
}

// Nom de feuille Excel (max 31 caractères, unique-ish)
function makeExcelSheetName(jobTitle: string, index: number): string {
    const baseSlug = slugifyJobTitle(jobTitle) || "metier";
    return baseSlug.slice(0, 31);
    // on garde une marge pour le suffixe _01
    let name = baseSlug.slice(0, 25);
    const suffix = `_${String(index + 1).padStart(2, "0")}`; // _01, _02, etc.
    name = (name + suffix).slice(0, 31); // Excel: max 31 chars
    return name;
}

async function exportJobsToCSVAndXLSX(jobObjects: any[]) {
    // S’assurer que le dossier de sortie existe
    await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });

    // Header commun
    const headerRow = [
        "Famille de compétences",
        "Sous-famille de compétences",
        "Compétences",
        "Type"
    ];

    // On prépare les données pour le classeur Excel
    const workbookSheetsData: { jobTitle: string; rows: any[][] }[] = [];

    for (const jobObject of jobObjects) {
        const jobTitle = jobObject.title as string;

        // --- CSV pour CE métier ---
        const csvRows: string[] = [headerRow.join(";")];

        // --- Données pour la feuille Excel de CE métier ---
        const sheetRows: any[][] = [headerRow];

        for (const family of jobObject.competenciesFamilies ?? []) {
            const familyName = family.name;

            for (const subFamily of family.children ?? []) {
                const subFamilyName = subFamily.name;

                for (const competency of subFamily.competencies ?? []) {
                    const competencyName = competency.name;
                    const competencyType = competency.type == CompetencyType.HARD_SKILL ? "Savoir-faire" : "Savoir-être";

                    const rowCells = [
                        // jobTitle,
                        familyName,
                        subFamilyName,
                        competencyName,
                        competencyType,
                    ];

                    // CSV
                    csvRows.push(rowCells.join(";"));

                    // XLSX (tableau 2D)
                    sheetRows.push(rowCells);
                }
            }
        }

        // Écriture du CSV métier
        const jobSlug = slugifyJobTitle(jobTitle);
        const csvFileName = `job_${jobSlug || "metier"}.csv`;
        const csvOutputPath = path.join(OUTPUT_DIR, csvFileName);

        await fs.promises.writeFile(csvOutputPath, csvRows.join("\n"), "utf-8");
        console.log(`CSV export completed for job "${jobTitle}": ${csvOutputPath}`);

        // On mémorise les lignes pour la future feuille Excel
        workbookSheetsData.push({
            jobTitle,
            rows: sheetRows,
        });
    }

    // --- Construction du fichier XLSX global ---

    // Tri des métiers par ordre alphabétique (en français)
    workbookSheetsData.sort((a, b) =>
        a.jobTitle.localeCompare(b.jobTitle, "fr-FR")
    );

    const workbook = XLSX.utils.book_new();

    workbookSheetsData.forEach((entry, index) => {
        const ws = XLSX.utils.aoa_to_sheet(entry.rows);
        const sheetName = makeExcelSheetName(entry.jobTitle, index);
        XLSX.utils.book_append_sheet(workbook, ws, sheetName);
    });

    XLSX.writeFile(workbook, OUTPUT_XLSX_PATH);
    console.log(`XLSX export completed: ${OUTPUT_XLSX_PATH}`);
}

async function fetchJobsFromDatabase(): Promise<any[]> {
    const baseJobs: Job[] = await prisma.job.findMany({});

    const jobs: any[] = [];
    for (const baseJob of baseJobs) {
        const jobWithCompetencies = await prisma.job.findUnique({
            where: { id: baseJob.id },
            include: {
                competenciesFamilies: {
                    include: {
                        children: {
                            where: {
                                childrenJobs: {
                                    some: { id: baseJob.id },
                                },
                            },
                            include: {
                                competencies: {
                                    where: {
                                        jobs: {
                                            some: { id: baseJob.id },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (jobWithCompetencies) {
            jobs.push(jobWithCompetencies);
        }
    }

    return jobs;
}

async function main() {
    const jobs = await fetchJobsFromDatabase();
    await exportJobsToCSVAndXLSX(jobs);
}

main()
    .then(() => {
        console.log("Script finished successfully.");
        process.exit(0);
    })
    .catch((error) => {
        console.error("Error during script execution:", error);
        process.exit(1);
    });
