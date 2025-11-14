// main.ts
import OpenAI from "openai";
import {
    JobFamilyDto, JobDto, CompetencyFamilyDto, CompetencyDto, QuizDto, QuizQuestionDto, QuizResponseDto, QuizQuestionCompetencyDto,
    JobFamilyLLM, JobLLM, CompetencyFamilyLLM, CompetencyLLM, QuizLLM, QuizQuestionLLM, QuizResponseLLM, QuizQuestionCompetencyLLM
} from "./domain-types"; // <- your file with interfaces + LLM mappers

// ---------------------------------------------
// OpenAI client
// ---------------------------------------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const MODEL = "gpt-5"; // or "gpt-5-thinking" etc. See official docs.

async function askLLM<T>(instruction: string, fromLLM: (json: unknown) => T): Promise<T> {
    // 1) Send instruction; 2) parse JSON; 3) validate via fromLLM
    const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [{ role: "user", content: instruction }],
        // tip: to harden JSON-only, you can add response_format if you use structured outputs
        // response_format: { type: "json_object" } // see docs if you enable structured outputs
    });

    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    // Some models may wrap JSON in code fences. Strip defensively.
    const jsonText = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonText);
    } catch (e) {
        throw new Error("LLM did not return valid JSON: " + jsonText);
    }
    return fromLLM(parsed);
}

// ---------------------------------------------
// Prompt builders (simple, deterministic framing)
// ---------------------------------------------
function jobFamilyPrompt(jobTitle: string) {
    return `From the job title: "${jobTitle}", propose the most appropriate job family taxonomy node.
Write ONLY the JSON for JobFamily with the exact keys and types from the schema.`;
}

function jobPrompt(jobTitle: string) {
    return `Generate a Job object for the title "${jobTitle}".
- normalizedName should be a normalized slug version of the title (lowercase, underscores or dashes).
- description can be null if unsure.
- Colors can be simple valid hex RGBA (e.g. #FFFFFFFF), and popularity 0..100.
Write ONLY the JSON for Job with the exact keys and types from the schema.`;
}

function competencyFamilyPrompt(jobTitle: string) {
    return `Propose one competency family directly relevant to "${jobTitle}".
Keep it concise. Write ONLY the JSON for CompetencyFamily.`;
}

function competencyPrompt(jobTitle: string) {
    return `Propose one core competency for "${jobTitle}" with reasonable score thresholds.
Use HARD_SKILL for technical skills and SOFT_SKILL for behavioral ones as needed.
Write ONLY the JSON for Competency.`;
}

function quizPrompt(jobTitle: string) {
    return `Generate a positioning Quiz for "${jobTitle}".
Keep title/description concise. Level is one of EASY|MEDIUM|HARD|EXPERT.
Write ONLY the JSON for Quiz.`;
}

function quizQuestionPrompt(jobTitle: string) {
    return `Generate ONE QuizQuestion for a positioning quiz of "${jobTitle}".
Use type from enum (single_choice|multiple_choice|true_false|short_answer|fill_in_the_blank).
Include sensible timeLimitInSeconds, points, index=1, and metadata=null.
Write ONLY the JSON for QuizQuestion.`;
}

function quizResponsePrompt(jobTitle: string) {
    return `Generate THREE QuizResponse options for the previously designed question for "${jobTitle}".
Return ONLY ONE response (we will call you 3 times). The first call should be the CORRECT one with index=1, then two incorrect with index=2/3.
Write ONLY the JSON for QuizResponse.`;
}

function qqcPrompt(jobTitle: string) {
    return `Link the previously generated question to the competency with a weight (1..5) relevant to "${jobTitle}".
Write ONLY the JSON for QuizQuestionCompetency.`;
}

// ---------------------------------------------
// Orchestrator
// ---------------------------------------------
export async function main(jobTitle: string) {
    // 1) JobFamily
    const jf = await askLLM(JobFamilyLLM.toLLM(jobFamilyPrompt(jobTitle)), JobFamilyLLM.fromLLM);

    // 2) Job (no relations here; DB layer will attach jobFamilyId later)
    const job = await askLLM(JobLLM.toLLM(jobPrompt(jobTitle)), JobLLM.fromLLM);

    // 3) CompetencyFamily
    const cf = await askLLM(CompetencyFamilyLLM.toLLM(competencyFamilyPrompt(jobTitle)), CompetencyFamilyLLM.fromLLM);

    // 4) Competency
    const comp = await askLLM(CompetencyLLM.toLLM(competencyPrompt(jobTitle)), CompetencyLLM.fromLLM);

    // 5) Quiz (positioning)
    const quiz = await askLLM(QuizLLM.toLLM(quizPrompt(jobTitle)), QuizLLM.fromLLM);

    // 6) QuizQuestion
    const q1 = await askLLM(QuizQuestionLLM.toLLM(quizQuestionPrompt(jobTitle)), QuizQuestionLLM.fromLLM);

    // 7) QuizResponses (4 calls to create 4 options)
    const r1 = await askLLM(QuizResponseLLM.toLLM(quizResponsePrompt(jobTitle)), QuizResponseLLM.fromLLM);
    const r2 = await askLLM(QuizResponseLLM.toLLM(quizResponsePrompt(jobTitle)), QuizResponseLLM.fromLLM);
    const r3 = await askLLM(QuizResponseLLM.toLLM(quizResponsePrompt(jobTitle)), QuizResponseLLM.fromLLM);
    const r4 = await askLLM(QuizResponseLLM.toLLM(quizResponsePrompt(jobTitle)), QuizResponseLLM.fromLLM);

    // 8) Link question ↔ competency with a weight
    const qqc = await askLLM(QuizQuestionCompetencyLLM.toLLM(qqcPrompt(jobTitle)), QuizQuestionCompetencyLLM.fromLLM);

    // ------------------------------
    // Return the bundle (pure data)
    // (DB persistence and foreign keys handled in your service layer)
    // ------------------------------
    return {
        jobFamily: jf as JobFamilyDto,
        job: job as JobDto,
        competencyFamily: cf as CompetencyFamilyDto,
        competency: comp as CompetencyDto,
        quiz: quiz as QuizDto,
        question: q1 as QuizQuestionDto,
        responses: [r1, r2, r3, r4] as QuizResponseDto[],
        questionCompetency: qqc as QuizQuestionCompetencyDto
    };
}

// Example CLI usage
if (require.main === module) {
    const jobTitle = process.argv.slice(2).join(" ").trim() || "UI Designer";
    main(jobTitle)
        .then(bundle => {
            console.log(JSON.stringify(bundle, null, 2));
        })
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}
