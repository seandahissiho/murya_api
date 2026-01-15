ALTER TABLE "LearningResource"
    ADD COLUMN IF NOT EXISTS "jobFamilyId" UUID;

ALTER TABLE "LearningResource"
    ADD CONSTRAINT "fk_learning_resource_job_family"
        FOREIGN KEY ("jobFamilyId") REFERENCES "JobFamily"("id")
        ON UPDATE CASCADE ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_learning_resource_job_family"
    ON "LearningResource" ("jobFamilyId");
