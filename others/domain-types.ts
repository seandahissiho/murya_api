// ===== Dtos (sans id/relations ni createdAt/updatedAt) =====
import {CompetencyType, Level, QuizQuestionType} from "@prisma/client";

export interface JobFamilyDto {
    name: string;
    normalizedName: string;
}

export interface JobDto {
    title: string;
    normalizedName: string;
    description: string | null;
    isActive: boolean;
    popularity: number;
    backgroundColor: string;
    foregroundColor: string;
    textColor: string;
    overlayColor: string;
    imageIndex: number;
}

export interface CompetencyFamilyDto {
    name: string;
    normalizedName: string;
    description: string;
}

export interface CompetencyDto {
    name: string;
    normalizedName: string;
    beginnerScore: number;
    intermediateScore: number;
    advancedScore: number;
    expertScore: number;
    maxScore: number;
    type: CompetencyType;
    level: Level;
}

export interface QuizDto {
    title: string | null;
    description: string | null;
    level: Level;
}

export interface QuizQuestionDto {
    text: string;
    timeLimitInSeconds: number;
    points: number;
    type: QuizQuestionType;
    mediaUrl: string;
    index: number;
    metadata: Record<string, unknown> | null;
}

export interface QuizResponseDto {
    text: string;
    metadata: Record<string, unknown> | null;
    isCorrect: boolean;
    index: number;
}

export interface QuizQuestionCompetencyDto {
    weight: number;
}

// ===================================================================
// =============== Generic helpers for toLLM / fromLLM ===============
// ===================================================================
type PrimitiveKind = "string" | "number" | "boolean";
type FieldSpec =
    | { kind: PrimitiveKind; nullable?: boolean }
    | { kind: "enum"; values: readonly string[]; nullable?: boolean }
    | { kind: "object"; nullable?: boolean } // for metadata objects, shallow
    ;

type SchemaSpec<T extends object> = {
    [K in keyof T]-?: FieldSpec;
};

function expectType(name: string, v: unknown, kind: PrimitiveKind, nullable?: boolean) {
    if (v === null && nullable) return;
    if (kind === "string" && typeof v !== "string") throw new Error(`${name} must be string`);
    if (kind === "number" && typeof v !== "number") throw new Error(`${name} must be number`);
    if (kind === "boolean" && typeof v !== "boolean") throw new Error(`${name} must be boolean`);
}

function expectEnum(name: string, v: unknown, values: readonly string[], nullable?: boolean) {
    if (v === null && nullable) return;
    if (typeof v !== "string" || !values.includes(v)) {
        throw new Error(`${name} must be one of: ${values.join(", ")}`);
    }
}

function expectObject(name: string, v: unknown, nullable?: boolean) {
    if (v === null && nullable) return;
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
        throw new Error(`${name} must be an object`);
    }
}

function sanitizeBySchema<T extends object>(
    data: Record<string, unknown>,
    schema: SchemaSpec<T>
): T {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(schema) as Array<keyof T>) {
        const spec = schema[key];
        const val = data[key as string];

        if (spec.kind === "enum") {
            expectEnum(String(key), val, spec.values, spec.nullable);
            out[key as string] = val;
        } else if (spec.kind === "object") {
            expectObject(String(key), val, spec.nullable);
            out[key as string] = val ?? null;
        } else {
            expectType(String(key), val, spec.kind, spec.nullable);
            out[key as string] = val ?? null;
        }
    }
    return out as T;
}

function makeToLLM<T extends object>(
    entityName: string,
    schema: SchemaSpec<T>
): (prompt: string) => string {
    // Produces a strict instruction for ChatGPT to output JSON ONLY with the specified keys and types
    return (prompt: string) => {
        const shape = Object.entries(schema).reduce<Record<string, string>>((acc, [k, spec]: [string, any]) => {
            if (spec.kind === "enum") {
                acc[k] = `enum(${spec.values.join(" | ")})${spec.nullable ? " | null" : ""}`;
            } else if (spec.kind === "object") {
                acc[k] = `object${spec.nullable ? " | null" : ""}`;
            } else {
                acc[k] = `${spec.kind}${spec.nullable ? " | null" : ""}`;
            }
            return acc;
        }, {});
        return [
            `You are generating JSON for entity "${entityName}".`,
            `Task: Based on the following prompt, generate ONLY a valid JSON object matching EXACTLY the required keys and types.`,
            `Do NOT include explanations or markdown. Output raw JSON only.`,
            `Prompt: ${prompt}`,
            `Schema: ${JSON.stringify(shape, null, 2)}`,
            `Constraints:`,
            `- Use the exact keys.`,
            `- Types must match (enums must use one of the listed literal values).`,
            `- No extra fields.`,
        ].join("\n");
    };
}

function makeFromLLM<T extends object>(
    schema: SchemaSpec<T>
): (json: unknown) => T {
    return (json: unknown) => {
        if (typeof json !== "object" || json === null || Array.isArray(json)) {
            throw new Error("fromLLM expects a JSON object");
        }
        // Shallow coerce: ignore extraneous keys, validate required ones by schema
        return sanitizeBySchema(json as Record<string, unknown>, schema);
    };
}

// ===================================================================
// =================== Schemas + mappers per entity ==================
// ===================================================================

const JobFamilySchema: SchemaSpec<JobFamilyDto> = {
    name: { kind: "string" },
    normalizedName: { kind: "string" },
};

export const JobFamilyLLM = {
    toLLM: makeToLLM<JobFamilyDto>("JobFamily", JobFamilySchema),
    fromLLM: makeFromLLM<JobFamilyDto>(JobFamilySchema),
};

const JobSchema: SchemaSpec<JobDto> = {
    title: { kind: "string" },
    normalizedName: { kind: "string" },
    description: { kind: "string", nullable: true },
    isActive: { kind: "boolean" },
    popularity: { kind: "number" },
    backgroundColor: { kind: "string" },
    foregroundColor: { kind: "string" },
    textColor: { kind: "string" },
    overlayColor: { kind: "string" },
    imageIndex: { kind: "number" },
};

export const JobLLM = {
    toLLM: makeToLLM<JobDto>("Job", JobSchema),
    fromLLM: makeFromLLM<JobDto>(JobSchema),
};

const CompetencyFamilySchema: SchemaSpec<CompetencyFamilyDto> = {
    name: { kind: "string" },
    normalizedName: { kind: "string" },
    description: { kind: "string" },
};

export const CompetencyFamilyLLM = {
    toLLM: makeToLLM<CompetencyFamilyDto>("CompetencyFamily", CompetencyFamilySchema),
    fromLLM: makeFromLLM<CompetencyFamilyDto>(CompetencyFamilySchema),
};

const CompetencySchema: SchemaSpec<CompetencyDto> = {
    name: { kind: "string" },
    normalizedName: { kind: "string" },
    beginnerScore: { kind: "number" },
    intermediateScore: { kind: "number" },
    advancedScore: { kind: "number" },
    expertScore: { kind: "number" },
    maxScore: { kind: "number" },
    type: { kind: "enum", values: Object.values(CompetencyType) },
    level: { kind: "enum", values: Object.values(Level) },
};

export const CompetencyLLM = {
    toLLM: makeToLLM<CompetencyDto>("Competency", CompetencySchema),
    fromLLM: makeFromLLM<CompetencyDto>(CompetencySchema),
};

const QuizSchema: SchemaSpec<QuizDto> = {
    title: { kind: "string", nullable: true },
    description: { kind: "string", nullable: true },
    level: { kind: "enum", values: Object.values(Level) },
};

export const QuizLLM = {
    toLLM: makeToLLM<QuizDto>("Quiz", QuizSchema),
    fromLLM: makeFromLLM<QuizDto>(QuizSchema),
};

const QuizQuestionSchema: SchemaSpec<QuizQuestionDto> = {
    text: { kind: "string" },
    timeLimitInSeconds: { kind: "number" },
    points: { kind: "number" },
    type: { kind: "enum", values: Object.values(QuizQuestionType) },
    mediaUrl: { kind: "string" },
    index: { kind: "number" },
    metadata: { kind: "object", nullable: true },
};

export const QuizQuestionLLM = {
    toLLM: makeToLLM<QuizQuestionDto>("QuizQuestion", QuizQuestionSchema),
    fromLLM: makeFromLLM<QuizQuestionDto>(QuizQuestionSchema),
};

const QuizResponseSchema: SchemaSpec<QuizResponseDto> = {
    text: { kind: "string" },
    metadata: { kind: "object", nullable: true },
    isCorrect: { kind: "boolean" },
    index: { kind: "number" },
};

export const QuizResponseLLM = {
    toLLM: makeToLLM<QuizResponseDto>("QuizResponse", QuizResponseSchema),
    fromLLM: makeFromLLM<QuizResponseDto>(QuizResponseSchema),
};

const QuizQuestionCompetencySchema: SchemaSpec<QuizQuestionCompetencyDto> = {
    weight: { kind: "number" },
};

export const QuizQuestionCompetencyLLM = {
    toLLM: makeToLLM<QuizQuestionCompetencyDto>("QuizQuestionCompetency", QuizQuestionCompetencySchema),
    fromLLM: makeFromLLM<QuizQuestionCompetencyDto>(QuizQuestionCompetencySchema),
};

// ========================== Usage examples ==========================
// const prompt = "Génère un UI Designer (junior) ...";
// const llmInstruction = JobLLM.toLLM(prompt);
// -- send llmInstruction to ChatGPT, expect raw JSON only --
// const job: Job = JobLLM.fromLLM(receivedJsonObject);
