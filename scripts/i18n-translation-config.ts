export type EntityConfig = {
    entity: string;
    model: string;
    idField: string;
    fields: string[];
    where?: Record<string, any>;
};

export const ENTITY_CONFIGS: EntityConfig[] = [
    { entity: "Job", model: "job", idField: "id", fields: ["title", "description"] },
    { entity: "JobFamily", model: "jobFamily", idField: "id", fields: ["name", "description"] },
    { entity: "CompetenciesFamily", model: "competenciesFamily", idField: "id", fields: ["name", "description"] },
    { entity: "CompetenciesSubFamily", model: "competenciesSubFamily", idField: "id", fields: ["name", "description"] },
    { entity: "Competency", model: "competency", idField: "id", fields: ["name", "description"] },
    { entity: "JobKiviat", model: "jobKiviat", idField: "id", fields: ["level"] },
    { entity: "Module", model: "module", idField: "id", fields: ["name", "description"] },
    { entity: "QuestDefinition", model: "questDefinition", idField: "id", fields: ["title", "description"] },
    { entity: "QuestGroup", model: "questGroup", idField: "id", fields: ["title", "description"] },
    { entity: "Reward", model: "reward", idField: "id", fields: ["title", "description", "redeemInstructions"] },
    { entity: "Quiz", model: "quiz", idField: "id", fields: ["title", "description"] },
    { entity: "QuizQuestion", model: "quizQuestion", idField: "id", fields: ["text"] },
    { entity: "QuizResponse", model: "quizResponse", idField: "id", fields: ["text"] },
    {
        entity: "LearningResource",
        model: "learningResource",
        idField: "id",
        fields: ["title", "description", "content"],
        where: { source: { in: ["SYSTEM_DEFAULT", "AI_GENERATED"] } },
    },
];
