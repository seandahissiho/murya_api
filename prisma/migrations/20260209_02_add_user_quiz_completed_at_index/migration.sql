-- Add index to speed ranking queries filtered by completedAt
CREATE INDEX "idx_user_quiz_completed_at"
ON "UserQuiz" ("userJobId", "status", "completedAt");
