-- Adjust JobProgressionLevel enum order and remap existing values

ALTER TYPE "JobProgressionLevel" RENAME TO "JobProgressionLevel_old";

CREATE TYPE "JobProgressionLevel" AS ENUM ('BEGINNER', 'JUNIOR', 'MIDLEVEL', 'SENIOR');

ALTER TABLE "JobKiviat" ALTER COLUMN "level" TYPE "JobProgressionLevel" USING (
  CASE "level"::text
    WHEN 'JUNIOR' THEN 'BEGINNER'
    WHEN 'MIDLEVEL' THEN 'JUNIOR'
    WHEN 'SENIOR' THEN 'MIDLEVEL'
    WHEN 'EXPERT' THEN 'SENIOR'
    ELSE NULL
  END::"JobProgressionLevel"
);

ALTER TABLE "UserJobKiviat" ALTER COLUMN "level" TYPE "JobProgressionLevel" USING (
  CASE "level"::text
    WHEN 'JUNIOR' THEN 'BEGINNER'
    WHEN 'MIDLEVEL' THEN 'JUNIOR'
    WHEN 'SENIOR' THEN 'MIDLEVEL'
    WHEN 'EXPERT' THEN 'SENIOR'
    ELSE NULL
  END::"JobProgressionLevel"
);

ALTER TABLE "UserJobKiviatHistory" ALTER COLUMN "level" TYPE "JobProgressionLevel" USING (
  CASE "level"::text
    WHEN 'JUNIOR' THEN 'BEGINNER'
    WHEN 'MIDLEVEL' THEN 'JUNIOR'
    WHEN 'SENIOR' THEN 'MIDLEVEL'
    WHEN 'EXPERT' THEN 'SENIOR'
    ELSE NULL
  END::"JobProgressionLevel"
);

DROP TYPE "JobProgressionLevel_old";
