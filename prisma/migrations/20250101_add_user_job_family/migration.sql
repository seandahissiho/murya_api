-- Add scope and job family support for UserJob
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserJobScope') THEN
        CREATE TYPE "UserJobScope" AS ENUM ('JOB', 'JOB_FAMILY');
    END IF;
END$$;

ALTER TABLE "UserJob"
    ADD COLUMN IF NOT EXISTS "scope" "UserJobScope" NOT NULL DEFAULT 'JOB',
    ADD COLUMN IF NOT EXISTS "jobFamilyId" UUID,
    ALTER COLUMN "jobId" DROP NOT NULL;

-- Enforce scope XOR constraint
ALTER TABLE "UserJob"
    DROP CONSTRAINT IF EXISTS "user_job_scope_xor",
    ADD CONSTRAINT "user_job_scope_xor"
        CHECK (
            ("scope" = 'JOB' AND "jobId" IS NOT NULL AND "jobFamilyId" IS NULL)
            OR
            ("scope" = 'JOB_FAMILY' AND "jobFamilyId" IS NOT NULL AND "jobId" IS NULL)
        );

-- Unique track per job family (partial)
CREATE UNIQUE INDEX IF NOT EXISTS "unique_user_job_family"
    ON "UserJob" ("userId", "jobFamilyId")
    WHERE "jobFamilyId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_user_job_job_family"
    ON "UserJob" ("jobFamilyId");

-- Track-selected jobs table
CREATE TABLE IF NOT EXISTS "UserJobSelectedJob" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userJobId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "isSelected" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT now()
);

ALTER TABLE "UserJobSelectedJob"
    ADD CONSTRAINT "fk_user_job_selected_job_user_job"
        FOREIGN KEY ("userJobId") REFERENCES "UserJob"("id")
        ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "UserJobSelectedJob"
    ADD CONSTRAINT "fk_user_job_selected_job_job"
        FOREIGN KEY ("jobId") REFERENCES "Job"("id")
        ON UPDATE CASCADE ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "unique_user_job_selected_job"
    ON "UserJobSelectedJob" ("userJobId", "jobId");

CREATE INDEX IF NOT EXISTS "idx_user_job_selected_job_user_job"
    ON "UserJobSelectedJob" ("userJobId");

CREATE INDEX IF NOT EXISTS "idx_user_job_selected_job_job"
    ON "UserJobSelectedJob" ("jobId");

-- Snapshot of selected jobs on UserQuiz
ALTER TABLE "UserQuiz"
    ADD COLUMN IF NOT EXISTS "jobsSnapshot" JSONB;
