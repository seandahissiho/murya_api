ALTER TABLE "Quiz"
    ADD COLUMN IF NOT EXISTS "jobFamilyId" UUID,
    ALTER COLUMN "jobId" DROP NOT NULL;

ALTER TABLE "Quiz"
    DROP CONSTRAINT IF EXISTS "quiz_scope_xor",
    ADD CONSTRAINT "quiz_scope_xor"
        CHECK (
            ("jobId" IS NOT NULL AND "jobFamilyId" IS NULL)
            OR
            ("jobFamilyId" IS NOT NULL AND "jobId" IS NULL)
        );

ALTER TABLE "Quiz"
    ADD CONSTRAINT "fk_quiz_job_family"
        FOREIGN KEY ("jobFamilyId") REFERENCES "JobFamily"("id")
        ON UPDATE CASCADE ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_quiz_job_family"
    ON "Quiz" ("jobFamilyId");
