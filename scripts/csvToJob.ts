import path from "path";
import {createJobWithCompetencies} from "../src/services/jobs.services";

type AcquisitionLevel = "Facile" | "Moyen" | "Difficile" | "Expert";
type CompetencyKind = "SavoirFaire" | "SavoirEtre";

interface Competency {
    kind: CompetencyKind;
    name: string;
    slug: string;
    acquisitionLevel: AcquisitionLevel;
    description: string; // <= 45 chars
}

interface SubFamily {
    name: string;
    slug: string;
    competencies: Competency[];
}

interface Family {
    name: string;
    slug: string;
    subFamilies: SubFamily[];
}

interface JobCorpus {
    jobTitle: string;
    jobDescription: string;
    slug: string;
    families: Family[];
}

function toSnakeCase(input: string): string {
    return input
        .normalize("NFD")                    // remove accents
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")         // non alphanum → _
        .replace(/^_+|_+$/g, "");            // trim _
}

export function buildJobCorpusFromCsv(
    csv: string,
    jobDescription: string = ""
): JobCorpus {
    // --- 1) Split into lines & detect delimiter ---
    const lines = csv.trim().split(/\r?\n/);
    if (lines.length < 2) {
        throw new Error("CSV must contain a header and at least one data row.");
    }

    const headerLine = lines[0];
    // Here we assume TSV like your sample. If needed, you can change this to ';' or ','.
    const delimiter = headerLine.includes("\t") ? "\t" : ";";

    const headers = headerLine.split(delimiter).map((h) => h.trim());

    const roleIdx = headers.indexOf("Role");
    const familyIdx = headers.indexOf("Famille");
    const subFamilyIdx = headers.indexOf("Sous-famille");
    const competencyIdx = headers.indexOf("Compétence");
    const typeIdx = headers.indexOf("Type");
    const levelIdx = headers.indexOf("Niveau");

    if (
        roleIdx === -1 ||
        familyIdx === -1 ||
        subFamilyIdx === -1 ||
        competencyIdx === -1 ||
        typeIdx === -1 ||
        levelIdx === -1
    ) {
        throw new Error(
            "CSV header must contain: Role, Famille, Sous-famille, Compétence, Type, Niveau"
        );
    }

    // --- 2) Prepare grouping structures ---
    let jobTitle: string | null = null;

    type SubFamilyInternal = {
        name: string;
        slug: string;
        competencies: Competency[];
    };

    type FamilyInternal = {
        name: string;
        slug: string;
        subFamiliesMap: Map<string, SubFamilyInternal>;
    };

    const familiesMap = new Map<string, FamilyInternal>();

    // --- 3) Iterate over each data row ---
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // skip empty lines

        const cols = line.split(delimiter);

        if (cols.length < headers.length) {
            // tolerate short lines but skip them
            continue;
        }

        const role = cols[roleIdx].trim();
        const familyName = cols[familyIdx].trim();
        const subFamilyName = cols[subFamilyIdx].trim();
        const competencyName = cols[competencyIdx].trim();
        const typeRaw = cols[typeIdx].trim();
        const levelRaw = cols[levelIdx].trim() as AcquisitionLevel;

        // Initialize jobTitle from first row
        if (!jobTitle) {
            jobTitle = role;
        }

        // --- 3.1) Map Type -> kind ---
        let kind: CompetencyKind;
        if (typeRaw.toLowerCase().includes("être")) {
            kind = "SavoirEtre";
        } else {
            kind = "SavoirFaire";
        }

        // --- 3.2) Ensure family exists ---
        let family = familiesMap.get(familyName);
        if (!family) {
            family = {
                name: familyName,
                slug: toSnakeCase(familyName),
                subFamiliesMap: new Map<string, SubFamilyInternal>(),
            };
            familiesMap.set(familyName, family);
        }

        // --- 3.3) Ensure sub-family exists within this family ---
        let subFamily = family.subFamiliesMap.get(subFamilyName);
        if (!subFamily) {
            subFamily = {
                name: subFamilyName,
                slug: toSnakeCase(subFamilyName),
                competencies: [],
            };
            family.subFamiliesMap.set(subFamilyName, subFamily);
        }

        // --- 3.4) Build competency ---
        const competencySlug = toSnakeCase(competencyName);

        const description =
            competencyName.length > 45
                ? competencyName.slice(0, 45) // hard cut to respect <= 45 chars
                : competencyName;

        const competency: Competency = {
            kind,
            name: competencyName,
            slug: competencySlug,
            acquisitionLevel: levelRaw,
            description,
        };

        subFamily.competencies.push(competency);
    }

    if (!jobTitle) {
        throw new Error("Could not determine jobTitle from CSV (no Role values).");
    }

    // --- 4) Build final families[] array from maps ---
    const families: Family[] = Array.from(familiesMap.values())
        .sort((a, b) => a.name.localeCompare(b.name)) // optional: sort families
        .map((familyInternal) => {
            const subFamilies: SubFamily[] = Array.from(
                familyInternal.subFamiliesMap.values()
            )
                .sort((a, b) => a.name.localeCompare(b.name)) // optional: sort sub-families
                .map((sf) => ({
                    name: sf.name,
                    slug: sf.slug,
                    competencies: sf.competencies,
                }));

            return {
                name: familyInternal.name,
                slug: familyInternal.slug,
                subFamilies,
            };
        });

    // --- 5) Build final JobCorpus object ---
    const jobCorpus: JobCorpus = {
        jobTitle,
        jobDescription,
        slug: toSnakeCase(jobTitle),
        families,
    };

    return jobCorpus;
}

export async function persistJobCorpus(jobCorpus: JobCorpus) {
    return await createJobWithCompetencies(jobCorpus);
}

function retrieveCsvContent(csvPathBase: string) {
    const fs = require("fs");
    try {
        const splitPath = csvPathBase.split(path.sep);
        const csvPath = path.join(__dirname, "..", ...splitPath);
        const content = fs.readFileSync(csvPath, "utf-8");
        return content;
    } catch (err: any) {
        throw new Error(`Error reading CSV file at ${csvPathBase}: ${err.message}`);
    }
}

if (require.main === module) {
    const csvPath = `data/jobs/product_manager/product_manager.csv`;

    const csvContent = retrieveCsvContent(csvPath);
    const jobCorpus = buildJobCorpusFromCsv(csvContent, "");
    persistJobCorpus(jobCorpus).then((result) => {
        console.log("Job and competencies persisted:", result);
    }).catch((err) => {
        console.error("Error persisting job corpus:", err);
    });
}
