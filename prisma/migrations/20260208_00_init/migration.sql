-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "permissions_action" AS ENUM ('CREATE', 'READ', 'UPDATE', 'DELETE');

-- CreateEnum
CREATE TYPE "permissions_entity" AS ENUM ('USER');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('SYSTEM', 'USER', 'PAYMENT', 'PURCHASE', 'SALE', 'HR', 'MARKETING', 'FINANCE', 'ADMINISTRATION', 'LEGAL', 'SUPPORT', 'SECURITY', 'MAINTENANCE', 'REPORT', 'ALERT', 'EVENT', 'REMINDER', 'FEEDBACK', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INFO', 'WARNING', 'ERROR', 'SUCCESS');

-- CreateEnum
CREATE TYPE "Genre" AS ENUM ('MALE', 'FEMALE', 'UNDEFINED');

-- CreateEnum
CREATE TYPE "CompetencyType" AS ENUM ('HARD_SKILL', 'SOFT_SKILL');

-- CreateEnum
CREATE TYPE "Level" AS ENUM ('EASY', 'MEDIUM', 'HARD', 'EXPERT', 'MIX');

-- CreateEnum
CREATE TYPE "CompetencyRating" AS ENUM ('TRES_BON', 'BON', 'MOYEN', 'MAUVAIS', 'TRES_MAUVAIS');

-- CreateEnum
CREATE TYPE "QuizQuestionType" AS ENUM ('single_choice', 'multiple_choice', 'true_false', 'short_answer', 'fill_in_the_blank');

-- CreateEnum
CREATE TYPE "UserJobStatus" AS ENUM ('TARGET', 'CURRENT', 'PAST');

-- CreateEnum
CREATE TYPE "UserJobScope" AS ENUM ('JOB', 'JOB_FAMILY');

-- CreateEnum
CREATE TYPE "LeagueTier" AS ENUM ('IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER');

-- CreateEnum
CREATE TYPE "JobProgressionLevel" AS ENUM ('BEGINNER', 'JUNIOR', 'MIDLEVEL', 'SENIOR');

-- CreateEnum
CREATE TYPE "UserQuizStatus" AS ENUM ('ASSIGNED', 'STARTED', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "QuizType" AS ENUM ('POSITIONING', 'DAILY');

-- CreateEnum
CREATE TYPE "StreakType" AS ENUM ('LOGIN_DAILY');

-- CreateEnum
CREATE TYPE "QuestPeriod" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'ONCE');

-- CreateEnum
CREATE TYPE "QuestStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CLAIMED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "QuestScope" AS ENUM ('USER', 'USER_JOB');

-- CreateEnum
CREATE TYPE "CurrencyType" AS ENUM ('DIAMONDS', 'LEAGUE_POINTS');

-- CreateEnum
CREATE TYPE "RewardKind" AS ENUM ('CINEMA', 'CONCERT', 'THEATRE', 'SPORTS', 'THEME_PARK', 'OTHER');

-- CreateEnum
CREATE TYPE "RewardFulfillmentMode" AS ENUM ('LOCAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "RewardRedeemMethod" AS ENUM ('NONE', 'CODE', 'QR_CODE', 'LINK');

-- CreateEnum
CREATE TYPE "RewardPurchaseStatus" AS ENUM ('CONFIRMED', 'FULFILLING', 'READY', 'REDEEMED', 'CANCELLED', 'REFUNDED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "QuestCategory" AS ENUM ('MAIN', 'BRANCH', 'COLLECTION', 'SHARE');

-- CreateEnum
CREATE TYPE "LearningResourceType" AS ENUM ('ARTICLE', 'PODCAST', 'VIDEO');

-- CreateEnum
CREATE TYPE "LearningResourceScope" AS ENUM ('JOB_DEFAULT', 'USER_JOB');

-- CreateEnum
CREATE TYPE "LearningResourceSource" AS ENUM ('SYSTEM_DEFAULT', 'AI_GENERATED', 'EXTERNAL_LINK');

-- CreateEnum
CREATE TYPE "ModuleStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ModuleVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "UserModuleStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'HIDDEN');

-- CreateEnum
CREATE TYPE "LandingModuleAddedBy" AS ENUM ('SYSTEM', 'USER');

-- CreateEnum
CREATE TYPE "LandingModuleAction" AS ENUM ('ADD', 'REMOVE');

-- CreateEnum
CREATE TYPE "LandingModuleActor" AS ENUM ('SYSTEM', 'USER');

-- CreateTable
CREATE TABLE "Address" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ref" TEXT NOT NULL,
    "name" TEXT,
    "shortName" TEXT,
    "street" TEXT NOT NULL,
    "zip" TEXT,
    "city" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 1,
    "isVirtual" BOOLEAN DEFAULT false,
    "googleMapsUrl" VARCHAR(700),
    "googlePlaceId" VARCHAR(128),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actorUserId" UUID,
    "actorRoleId" UUID,
    "isAdmin" BOOLEAN,
    "method" VARCHAR(8) NOT NULL,
    "path" VARCHAR(512) NOT NULL,
    "route" VARCHAR(255),
    "statusCode" INTEGER NOT NULL,
    "durationMs" INTEGER,
    "ip" VARCHAR(64),
    "userAgent" VARCHAR(512),
    "params" JSONB,
    "query" JSONB,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "nameShort" VARCHAR(50),
    "logoUrl" VARCHAR(255),
    "email" VARCHAR(255),
    "phone" VARCHAR(50),
    "phone2" VARCHAR(50),
    "phone3" VARCHAR(50),
    "website" VARCHAR(255),
    "siret" VARCHAR(14),
    "siretValid" BOOLEAN DEFAULT false,
    "ifu" VARCHAR(13),
    "emcfNumber" VARCHAR(20),
    "description" TEXT,
    "addressId" UUID,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCompany" BOOLEAN NOT NULL DEFAULT true,
    "isClient" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyUser" (
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" VARCHAR(64),

    CONSTRAINT "CompanyUser_pkey" PRIMARY KEY ("companyId","userId")
);

-- CreateTable
CREATE TABLE "CompetenciesFamily" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetenciesFamily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetenciesSubFamily" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "familyId" UUID NOT NULL,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetenciesSubFamily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competency" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "type" "CompetencyType" NOT NULL,
    "level" "Level" NOT NULL DEFAULT 'EASY',
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Competency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Country" (
    "name" TEXT NOT NULL,
    "isoCode" TEXT NOT NULL,
    "iso3Code" TEXT,
    "phoneCode" TEXT,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("isoCode")
);

-- CreateTable
CREATE TABLE "CurrencyLedger" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "currency" "CurrencyType" NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" VARCHAR(120) NOT NULL,
    "refType" VARCHAR(60) NOT NULL,
    "refId" UUID NOT NULL,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurrencyLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "jobFamilyId" UUID,
    "title" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "popularity" INTEGER NOT NULL DEFAULT 0,
    "backgroundColor" VARCHAR(9) NOT NULL DEFAULT '#FFFFFFFF',
    "foregroundColor" VARCHAR(9) NOT NULL DEFAULT '#FFFFFFFF',
    "textColor" VARCHAR(9) NOT NULL DEFAULT '#FFFFFFFF',
    "overlayColor" VARCHAR(9) NOT NULL DEFAULT '#FFFFFFFF',
    "imageIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobFamily" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobFamily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobKiviat" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "jobId" UUID NOT NULL,
    "competenciesFamilyId" UUID NOT NULL,
    "level" "JobProgressionLevel" NOT NULL,
    "rawScore0to10" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "radarScore0to5" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "continuous0to10" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "masteryAvg0to1" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobKiviat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSubfamilyCompetency" (
    "jobId" UUID NOT NULL,
    "subFamilyId" UUID NOT NULL,
    "competencyId" UUID NOT NULL,

    CONSTRAINT "JobSubfamilyCompetency_pkey" PRIMARY KEY ("jobId","subFamilyId","competencyId")
);

-- CreateTable
CREATE TABLE "Language" (
    "code" VARCHAR(16) NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Language_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "LearningResource" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scope" "LearningResourceScope" NOT NULL DEFAULT 'USER_JOB',
    "type" "LearningResourceType" NOT NULL DEFAULT 'ARTICLE',
    "source" "LearningResourceSource" NOT NULL DEFAULT 'AI_GENERATED',
    "jobId" UUID,
    "jobFamilyId" UUID,
    "userJobId" UUID,
    "title" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255),
    "description" TEXT,
    "content" TEXT,
    "mediaUrl" VARCHAR(1024),
    "thumbnailUrl" VARCHAR(1024),
    "languageCode" VARCHAR(16),
    "estimatedDuration" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collectedAt" TIMESTAMP(0),
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "LearningResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Module" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "status" "ModuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "visibility" "ModuleVisibility" NOT NULL DEFAULT 'PUBLIC',
    "defaultOnLanding" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(255) NOT NULL,
    "content" TEXT,
    "is_important" BOOLEAN NOT NULL DEFAULT false,
    "category" "NotificationCategory" NOT NULL DEFAULT 'OTHER',
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRecipient" (
    "notificationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("notificationId","userId")
);

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" VARCHAR(255) NOT NULL,
    "category" "NotificationCategory" NOT NULL DEFAULT 'OTHER',
    "type" "NotificationType" NOT NULL DEFAULT 'INFO',
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "roleId" UUID,
    "entity" "permissions_entity" NOT NULL,
    "action" "permissions_action" NOT NULL,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestDefinition" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(80) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "period" "QuestPeriod" NOT NULL,
    "category" "QuestCategory" NOT NULL DEFAULT 'BRANCH',
    "scope" "QuestScope" NOT NULL DEFAULT 'USER_JOB',
    "eventKey" VARCHAR(80) NOT NULL,
    "targetCount" INTEGER NOT NULL DEFAULT 1,
    "meta" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "parentId" UUID,
    "uiOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestGroup" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(80) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "scope" "QuestScope" NOT NULL DEFAULT 'USER_JOB',
    "period" "QuestPeriod" NOT NULL DEFAULT 'MONTHLY',
    "meta" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "uiOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestGroupItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "questGroupId" UUID NOT NULL,
    "questDefinitionId" UUID NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "uiOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuestGroupItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestReward" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "questDefinitionId" UUID NOT NULL,
    "currency" "CurrencyType" NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "jobId" UUID,
    "jobFamilyId" UUID,
    "title" TEXT,
    "description" TEXT,
    "level" "Level" NOT NULL DEFAULT 'EASY',
    "type" "QuizType" NOT NULL DEFAULT 'POSITIONING',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizItem" (
    "quizId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "index" INTEGER NOT NULL,
    "pointsOverride" INTEGER,
    "timeLimitOverrideS" INTEGER,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizItem_pkey" PRIMARY KEY ("quizId","questionId")
);

-- CreateTable
CREATE TABLE "QuizQuestion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "competencyId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "level" "Level" NOT NULL,
    "type" "QuizQuestionType" NOT NULL DEFAULT 'single_choice',
    "mediaUrl" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL,
    "defaultTimeLimitS" INTEGER NOT NULL DEFAULT 30,
    "defaultPoints" INTEGER NOT NULL DEFAULT 1,
    "irtB" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "irtA" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "irtC" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "calibratedAt" TIMESTAMP(0),
    "exposureCount" INTEGER NOT NULL DEFAULT 0,
    "isBankActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizResponse" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "questionId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "metadata" JSONB,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "index" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "QuizResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reward" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(80) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "kind" "RewardKind" NOT NULL DEFAULT 'OTHER',
    "city" VARCHAR(120) NOT NULL,
    "imageUrl" VARCHAR(500) NOT NULL,
    "addressId" UUID,
    "costDiamonds" INTEGER NOT NULL DEFAULT 0,
    "totalStock" INTEGER,
    "remainingStock" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "visibleFrom" TIMESTAMP(0),
    "visibleTo" TIMESTAMP(0),
    "fulfillmentMode" "RewardFulfillmentMode" NOT NULL DEFAULT 'LOCAL',
    "providerKey" VARCHAR(80),
    "externalProductId" VARCHAR(120),
    "redeemMethod" "RewardRedeemMethod" NOT NULL DEFAULT 'CODE',
    "redeemInstructions" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardPurchase" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "rewardId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitCostDiamonds" INTEGER NOT NULL,
    "totalCostDiamonds" INTEGER NOT NULL,
    "status" "RewardPurchaseStatus" NOT NULL DEFAULT 'CONFIRMED',
    "idempotencyKey" VARCHAR(80) NOT NULL,
    "voucherCode" VARCHAR(120),
    "voucherQrPayload" TEXT,
    "voucherLink" VARCHAR(700),
    "externalOrderId" VARCHAR(160),
    "providerRaw" JSONB,
    "purchasedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(0),
    "redeemedAt" TIMESTAMP(0),
    "cancelledAt" TIMESTAMP(0),

    CONSTRAINT "RewardPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Translation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity" VARCHAR(64) NOT NULL,
    "entityId" UUID NOT NULL,
    "field" VARCHAR(64) NOT NULL,
    "langCode" VARCHAR(16) NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Translation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadedFile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdById" UUID,
    "updatedById" UUID,
    "file_name" VARCHAR(255),
    "file_url" VARCHAR(1024) NOT NULL,
    "mimeType" VARCHAR(128) NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadedFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firstname" TEXT,
    "lastname" TEXT,
    "email" VARCHAR(255),
    "phone" VARCHAR(30),
    "deviceId" VARCHAR(255),
    "password" TEXT,
    "diamonds" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLogin" TIMESTAMP(0),
    "avatarUrl" TEXT,
    "birthDate" TIMESTAMP(0),
    "genre" "Genre" DEFAULT 'UNDEFINED',
    "roleId" UUID NOT NULL,
    "refreshToken" TEXT,
    "addressId" UUID,
    "preferredLangCode" VARCHAR(16),
    "createdById" UUID,
    "updatedById" UUID,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserJob" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "scope" "UserJobScope" NOT NULL DEFAULT 'JOB',
    "jobId" UUID,
    "jobFamilyId" UUID,
    "status" "UserJobStatus" NOT NULL DEFAULT 'TARGET',
    "note" TEXT,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "maxScoreSum" INTEGER NOT NULL DEFAULT 0,
    "completedQuizzes" INTEGER NOT NULL DEFAULT 0,
    "lastQuizAt" TIMESTAMP(0),
    "leagueTier" "LeagueTier" NOT NULL DEFAULT 'IRON',
    "leaguePoints" INTEGER NOT NULL DEFAULT 0,
    "lastLeagueChange" TIMESTAMP(0),
    "winningStreak" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserJobCompetency" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userJobId" UUID NOT NULL,
    "competencyId" UUID NOT NULL,
    "currentScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "attemptsCount" INTEGER NOT NULL DEFAULT 0,
    "bestScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastQuizAt" TIMESTAMP(0),
    "theta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "thetaVar" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "thetaUpdatedAt" TIMESTAMP(0),
    "halfLifeDays" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "lastPracticedAt" TIMESTAMP(0),
    "hlrUpdatedAt" TIMESTAMP(0),
    "masteryNow" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mastery30d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "level" "Level",
    "rating" "CompetencyRating" NOT NULL DEFAULT 'MOYEN',
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserJobCompetency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserJobCompetencyHistory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userJobCompetencyId" UUID NOT NULL,
    "userQuizId" UUID NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lagSecondsSincePrev" INTEGER,
    "featuresSnapshot" JSONB,
    "thetaBefore" DOUBLE PRECISION,
    "thetaAfter" DOUBLE PRECISION,
    "halfLifeBeforeDays" DOUBLE PRECISION,
    "halfLifeAfterDays" DOUBLE PRECISION,
    "level" "Level",
    "rating" "CompetencyRating",
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserJobCompetencyHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserJobKiviat" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userJobId" UUID NOT NULL,
    "competenciesFamilyId" UUID NOT NULL,
    "rawScore0to10" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "radarScore0to5" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "continuous0to10" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "masteryAvg0to1" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "level" "JobProgressionLevel",
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserJobKiviat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserJobKiviatHistory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userJobKiviatId" UUID NOT NULL,
    "userQuizId" UUID NOT NULL,
    "rawScore0to10" DOUBLE PRECISION NOT NULL,
    "radarScore0to5" DOUBLE PRECISION NOT NULL,
    "continuous0to10" DOUBLE PRECISION NOT NULL,
    "masteryAvg0to1" DOUBLE PRECISION NOT NULL,
    "level" "JobProgressionLevel",
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserJobKiviatHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserJobLeagueHistory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userJobId" UUID NOT NULL,
    "fromTier" "LeagueTier",
    "toTier" "LeagueTier" NOT NULL,
    "deltaPoints" INTEGER NOT NULL DEFAULT 0,
    "reason" VARCHAR(255),
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserJobLeagueHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserJobQuest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userJobId" UUID NOT NULL,
    "questDefinitionId" UUID NOT NULL,
    "periodStartAt" TIMESTAMP(0) NOT NULL,
    "periodEndAt" TIMESTAMP(0) NOT NULL,
    "progressCount" INTEGER NOT NULL DEFAULT 0,
    "status" "QuestStatus" NOT NULL DEFAULT 'ACTIVE',
    "meta" JSONB,
    "completedAt" TIMESTAMP(0),
    "claimedAt" TIMESTAMP(0),
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserJobQuest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserJobSelectedJob" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userJobId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "isSelected" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserJobSelectedJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLandingModule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "moduleId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "addedBy" "LandingModuleAddedBy" NOT NULL,
    "addedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(0),

    CONSTRAINT "UserLandingModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLandingModuleEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "moduleId" UUID NOT NULL,
    "action" "LandingModuleAction" NOT NULL,
    "actor" "LandingModuleActor" NOT NULL,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "UserLandingModuleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLearningResource" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "openedAt" TIMESTAMP(0),
    "readAt" TIMESTAMP(0),
    "lastViewedAt" TIMESTAMP(0),
    "isLikedAt" TIMESTAMP(0),
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "progress" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserLearningResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserModule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "moduleId" UUID NOT NULL,
    "status" "UserModuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserQuest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "questDefinitionId" UUID NOT NULL,
    "status" "QuestStatus" NOT NULL DEFAULT 'ACTIVE',
    "progressCount" INTEGER NOT NULL DEFAULT 0,
    "periodStartAt" TIMESTAMP(0) NOT NULL,
    "periodEndAt" TIMESTAMP(0) NOT NULL,
    "completedAt" TIMESTAMP(0),
    "claimedAt" TIMESTAMP(0),
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserQuest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserQuestGroup" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "userJobId" UUID,
    "questGroupId" UUID NOT NULL,
    "status" "QuestStatus" NOT NULL DEFAULT 'ACTIVE',
    "requiredTotal" INTEGER NOT NULL DEFAULT 0,
    "requiredCompleted" INTEGER NOT NULL DEFAULT 0,
    "optionalTotal" INTEGER NOT NULL DEFAULT 0,
    "optionalCompleted" INTEGER NOT NULL DEFAULT 0,
    "periodStartAt" TIMESTAMP(0) NOT NULL,
    "periodEndAt" TIMESTAMP(0) NOT NULL,
    "completedAt" TIMESTAMP(0),
    "claimedAt" TIMESTAMP(0),
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserQuestGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserQuiz" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userJobId" UUID NOT NULL,
    "quizId" UUID NOT NULL,
    "type" "QuizType" NOT NULL DEFAULT 'DAILY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "status" "UserQuizStatus" NOT NULL DEFAULT 'ASSIGNED',
    "index" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(0),
    "completedAt" TIMESTAMP(0),
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "bonusPoints" INTEGER NOT NULL DEFAULT 0,
    "maxScore" INTEGER NOT NULL DEFAULT 0,
    "maxScoreWithBonus" INTEGER NOT NULL DEFAULT 0,
    "percentage" DOUBLE PRECISION DEFAULT 0,
    "jobsSnapshot" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserQuiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserQuizAnswer" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userQuizId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "timeToAnswer" INTEGER NOT NULL,
    "freeTextAnswer" TEXT,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "score" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserQuizAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserQuizAnswerOption" (
    "userQuizAnswerId" UUID NOT NULL,
    "responseId" UUID NOT NULL,

    CONSTRAINT "UserQuizAnswerOption_pkey" PRIMARY KEY ("userQuizAnswerId","responseId")
);

-- CreateTable
CREATE TABLE "UserStreak" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "type" "StreakType" NOT NULL DEFAULT 'LOGIN_DAILY',
    "currentDays" INTEGER NOT NULL DEFAULT 0,
    "bestDays" INTEGER NOT NULL DEFAULT 0,
    "lastActiveDay" VARCHAR(10),
    "streakStartDay" VARCHAR(10),
    "createdAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserStreak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CompetencyFamilies" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_CompetencyFamilies_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_JobCompetenciesFamilies" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_JobCompetenciesFamilies_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_CompetenciesSubFamilies" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_CompetenciesSubFamilies_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_JobCompetenciesSubfamilies" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_JobCompetenciesSubfamilies_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_JobCompetencies" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_JobCompetencies_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Address_ref_key" ON "Address"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "Address_name_key" ON "Address"("name");

-- CreateIndex
CREATE UNIQUE INDEX "unique_address" ON "Address"("street", "zip", "city", "countryId");

-- CreateIndex
CREATE INDEX "idx_audit_log_actor_created_at" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_audit_log_created_at" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "idx_audit_log_route" ON "AuditLog"("route");

-- CreateIndex
CREATE UNIQUE INDEX "company_name" ON "Company"("name");

-- CreateIndex
CREATE UNIQUE INDEX "company_email" ON "Company"("email");

-- CreateIndex
CREATE UNIQUE INDEX "company_siret" ON "Company"("siret");

-- CreateIndex
CREATE UNIQUE INDEX "company_ifu" ON "Company"("ifu");

-- CreateIndex
CREATE UNIQUE INDEX "company_emcf_number" ON "Company"("emcfNumber");

-- CreateIndex
CREATE INDEX "CompanyUser_userId_idx" ON "CompanyUser"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "competencies_family_name" ON "CompetenciesFamily"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CompetenciesFamily_slug_key" ON "CompetenciesFamily"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CompetenciesSubFamily_slug_key" ON "CompetenciesSubFamily"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "uq_subfamily_family_name" ON "CompetenciesSubFamily"("familyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Competency_slug_key" ON "Competency"("slug");

-- CreateIndex
CREATE INDEX "idx_competency_name" ON "Competency"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Country_isoCode_key" ON "Country"("isoCode");

-- CreateIndex
CREATE UNIQUE INDEX "Country_iso3Code_key" ON "Country"("iso3Code");

-- CreateIndex
CREATE UNIQUE INDEX "Country_phoneCode_key" ON "Country"("phoneCode");

-- CreateIndex
CREATE INDEX "idx_countries_name" ON "Country"("name");

-- CreateIndex
CREATE INDEX "CurrencyLedger_userId_createdAt_idx" ON "CurrencyLedger"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CurrencyLedger_currency_refType_refId_key" ON "CurrencyLedger"("currency", "refType", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_slug_key" ON "Job"("slug");

-- CreateIndex
CREATE INDEX "Job_jobFamilyId_idx" ON "Job"("jobFamilyId");

-- CreateIndex
CREATE UNIQUE INDEX "job_family_name" ON "JobFamily"("name");

-- CreateIndex
CREATE UNIQUE INDEX "JobFamily_slug_key" ON "JobFamily"("slug");

-- CreateIndex
CREATE INDEX "IDX_job_kiviat_job_id" ON "JobKiviat"("jobId");

-- CreateIndex
CREATE INDEX "IDX_job_kiviat_family_id" ON "JobKiviat"("competenciesFamilyId");

-- CreateIndex
CREATE UNIQUE INDEX "UQ_job_kiviat_job_family_level" ON "JobKiviat"("jobId", "competenciesFamilyId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "JobSubfamilyCompetency_jobId_competencyId_key" ON "JobSubfamilyCompetency"("jobId", "competencyId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningResource_slug_key" ON "LearningResource"("slug");

-- CreateIndex
CREATE INDEX "idx_learning_resource_job" ON "LearningResource"("jobId");

-- CreateIndex
CREATE INDEX "idx_learning_resource_job_family" ON "LearningResource"("jobFamilyId");

-- CreateIndex
CREATE INDEX "idx_learning_resource_user_job" ON "LearningResource"("userJobId");

-- CreateIndex
CREATE INDEX "idx_learning_resource_scope_type" ON "LearningResource"("scope", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Module_slug_key" ON "Module"("slug");

-- CreateIndex
CREATE INDEX "idx_module_status" ON "Module"("status");

-- CreateIndex
CREATE INDEX "idx_module_visibility" ON "Module"("visibility");

-- CreateIndex
CREATE INDEX "userId" ON "NotificationRecipient"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_key_key" ON "NotificationTemplate"("key");

-- CreateIndex
CREATE INDEX "permissions_role_id_index" ON "Permissions"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "unique_role_action_entity" ON "Permissions"("roleId", "action", "entity");

-- CreateIndex
CREATE UNIQUE INDEX "QuestDefinition_code_key" ON "QuestDefinition"("code");

-- CreateIndex
CREATE INDEX "QuestDefinition_isActive_period_idx" ON "QuestDefinition"("isActive", "period");

-- CreateIndex
CREATE INDEX "QuestDefinition_parentId_idx" ON "QuestDefinition"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestGroup_code_key" ON "QuestGroup"("code");

-- CreateIndex
CREATE INDEX "QuestGroup_isActive_idx" ON "QuestGroup"("isActive");

-- CreateIndex
CREATE INDEX "QuestGroupItem_questGroupId_idx" ON "QuestGroupItem"("questGroupId");

-- CreateIndex
CREATE INDEX "QuestGroupItem_questDefinitionId_idx" ON "QuestGroupItem"("questDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestGroupItem_questGroupId_questDefinitionId_key" ON "QuestGroupItem"("questGroupId", "questDefinitionId");

-- CreateIndex
CREATE INDEX "QuestReward_questDefinitionId_idx" ON "QuestReward"("questDefinitionId");

-- CreateIndex
CREATE INDEX "QuizItem_questionId_idx" ON "QuizItem"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizItem_quizId_index_key" ON "QuizItem"("quizId", "index");

-- CreateIndex
CREATE INDEX "QuizQuestion_competencyId_idx" ON "QuizQuestion"("competencyId");

-- CreateIndex
CREATE INDEX "QuizResponse_questionId_idx" ON "QuizResponse"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "Reward_code_key" ON "Reward"("code");

-- CreateIndex
CREATE INDEX "Reward_isActive_city_idx" ON "Reward"("isActive", "city");

-- CreateIndex
CREATE INDEX "Reward_kind_idx" ON "Reward"("kind");

-- CreateIndex
CREATE INDEX "Reward_remainingStock_idx" ON "Reward"("remainingStock");

-- CreateIndex
CREATE INDEX "Reward_addressId_idx" ON "Reward"("addressId");

-- CreateIndex
CREATE INDEX "RewardPurchase_userId_purchasedAt_idx" ON "RewardPurchase"("userId", "purchasedAt");

-- CreateIndex
CREATE INDEX "RewardPurchase_rewardId_purchasedAt_idx" ON "RewardPurchase"("rewardId", "purchasedAt");

-- CreateIndex
CREATE INDEX "RewardPurchase_status_idx" ON "RewardPurchase"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RewardPurchase_userId_idempotencyKey_key" ON "RewardPurchase"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "role_name" ON "Role"("name");

-- CreateIndex
CREATE INDEX "idx_translation_lang" ON "Translation"("langCode");

-- CreateIndex
CREATE INDEX "idx_translation_entity_field" ON "Translation"("entity", "field");

-- CreateIndex
CREATE UNIQUE INDEX "unique_translation_row" ON "Translation"("entity", "entityId", "field", "langCode");

-- CreateIndex
CREATE INDEX "uploaded_files_created_by_id_index" ON "UploadedFile"("createdById");

-- CreateIndex
CREATE INDEX "uploaded_files_updated_by_id_index" ON "UploadedFile"("updatedById");

-- CreateIndex
CREATE INDEX "User_preferredLangCode_idx" ON "User"("preferredLangCode");

-- CreateIndex
CREATE UNIQUE INDEX "unique_email_not_null" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "unique_phone_not_null" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "unique_device_not_null" ON "User"("deviceId");

-- CreateIndex
CREATE INDEX "idx_user_job_user" ON "UserJob"("userId");

-- CreateIndex
CREATE INDEX "idx_user_job_job" ON "UserJob"("jobId");

-- CreateIndex
CREATE INDEX "idx_user_job_job_family" ON "UserJob"("jobFamilyId");

-- CreateIndex
CREATE INDEX "idx_user_job_user_status" ON "UserJob"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "unique_user_job" ON "UserJob"("userId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "unique_user_job_family" ON "UserJob"("userId", "jobFamilyId");

-- CreateIndex
CREATE INDEX "idx_ujc_user_job" ON "UserJobCompetency"("userJobId");

-- CreateIndex
CREATE INDEX "idx_ujc_competency" ON "UserJobCompetency"("competencyId");

-- CreateIndex
CREATE UNIQUE INDEX "unique_user_job_competency" ON "UserJobCompetency"("userJobId", "competencyId");

-- CreateIndex
CREATE INDEX "idx_ujc_history_timeline" ON "UserJobCompetencyHistory"("userJobCompetencyId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_ujc_history_user_quiz" ON "UserJobCompetencyHistory"("userQuizId");

-- CreateIndex
CREATE INDEX "idx_user_job_kiviat_user_job" ON "UserJobKiviat"("userJobId");

-- CreateIndex
CREATE UNIQUE INDEX "unique_user_job_kiviat" ON "UserJobKiviat"("userJobId", "competenciesFamilyId");

-- CreateIndex
CREATE INDEX "idx_user_job_kiviat_history" ON "UserJobKiviatHistory"("userJobKiviatId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_user_job_kiviat_history_quiz" ON "UserJobKiviatHistory"("userQuizId");

-- CreateIndex
CREATE INDEX "idx_league_history_user_job" ON "UserJobLeagueHistory"("userJobId", "createdAt");

-- CreateIndex
CREATE INDEX "UserJobQuest_userJobId_status_periodStartAt_idx" ON "UserJobQuest"("userJobId", "status", "periodStartAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserJobQuest_userJobId_questDefinitionId_periodStartAt_key" ON "UserJobQuest"("userJobId", "questDefinitionId", "periodStartAt");

-- CreateIndex
CREATE INDEX "idx_user_job_selected_job_user_job" ON "UserJobSelectedJob"("userJobId");

-- CreateIndex
CREATE INDEX "idx_user_job_selected_job_job" ON "UserJobSelectedJob"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "unique_user_job_selected_job" ON "UserJobSelectedJob"("userJobId", "jobId");

-- CreateIndex
CREATE INDEX "idx_user_landing_module_user" ON "UserLandingModule"("userId");

-- CreateIndex
CREATE INDEX "idx_user_landing_module_module" ON "UserLandingModule"("moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "unique_user_landing_module" ON "UserLandingModule"("userId", "moduleId");

-- CreateIndex
CREATE INDEX "idx_user_landing_event_user" ON "UserLandingModuleEvent"("userId");

-- CreateIndex
CREATE INDEX "idx_user_landing_event_module" ON "UserLandingModuleEvent"("moduleId");

-- CreateIndex
CREATE INDEX "idx_user_landing_event_created_at" ON "UserLandingModuleEvent"("createdAt");

-- CreateIndex
CREATE INDEX "idx_user_learning_resource_user" ON "UserLearningResource"("userId");

-- CreateIndex
CREATE INDEX "idx_user_learning_resource_resource" ON "UserLearningResource"("resourceId");

-- CreateIndex
CREATE INDEX "idx_user_learning_resource_last_viewed_at" ON "UserLearningResource"("lastViewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "unique_user_learning_resource" ON "UserLearningResource"("userId", "resourceId");

-- CreateIndex
CREATE INDEX "idx_user_module_user" ON "UserModule"("userId");

-- CreateIndex
CREATE INDEX "idx_user_module_module" ON "UserModule"("moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "unique_user_module" ON "UserModule"("userId", "moduleId");

-- CreateIndex
CREATE INDEX "UserQuest_userId_idx" ON "UserQuest"("userId");

-- CreateIndex
CREATE INDEX "UserQuest_questDefinitionId_idx" ON "UserQuest"("questDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "UserQuest_userId_questDefinitionId_periodStartAt_key" ON "UserQuest"("userId", "questDefinitionId", "periodStartAt");

-- CreateIndex
CREATE INDEX "UserQuestGroup_userId_idx" ON "UserQuestGroup"("userId");

-- CreateIndex
CREATE INDEX "UserQuestGroup_userJobId_idx" ON "UserQuestGroup"("userJobId");

-- CreateIndex
CREATE INDEX "UserQuestGroup_questGroupId_idx" ON "UserQuestGroup"("questGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "UserQuestGroup_userId_userJobId_questGroupId_periodStartAt_key" ON "UserQuestGroup"("userId", "userJobId", "questGroupId", "periodStartAt");

-- CreateIndex
CREATE INDEX "idx_user_quiz_quiz" ON "UserQuiz"("quizId");

-- CreateIndex
CREATE INDEX "idx_user_quiz_core" ON "UserQuiz"("userJobId", "status", "type", "assignedAt");

-- CreateIndex
CREATE UNIQUE INDEX "unique_user_quiz_user_job_quiz" ON "UserQuiz"("userJobId", "quizId");

-- CreateIndex
CREATE INDEX "idx_user_quiz_answer_user_quiz" ON "UserQuizAnswer"("userQuizId");

-- CreateIndex
CREATE INDEX "idx_user_quiz_answer_question" ON "UserQuizAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "UserQuizAnswer_userQuizId_questionId_key" ON "UserQuizAnswer"("userQuizId", "questionId");

-- CreateIndex
CREATE INDEX "idx_user_quiz_answer_option_response" ON "UserQuizAnswerOption"("responseId");

-- CreateIndex
CREATE UNIQUE INDEX "UserStreak_userId_type_key" ON "UserStreak"("userId", "type");

-- CreateIndex
CREATE INDEX "_CompetencyFamilies_B_index" ON "_CompetencyFamilies"("B");

-- CreateIndex
CREATE INDEX "_JobCompetenciesFamilies_B_index" ON "_JobCompetenciesFamilies"("B");

-- CreateIndex
CREATE INDEX "_CompetenciesSubFamilies_B_index" ON "_CompetenciesSubFamilies"("B");

-- CreateIndex
CREATE INDEX "_JobCompetenciesSubfamilies_B_index" ON "_JobCompetenciesSubfamilies"("B");

-- CreateIndex
CREATE INDEX "_JobCompetencies_B_index" ON "_JobCompetencies"("B");

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("isoCode") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "FK_addresses_created_by" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "FK_addresses_updated_by" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "FK_companies_address_id" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "FK_companies_created_by" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "FK_companies_updated_by" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyUser" ADD CONSTRAINT "CompanyUser_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyUser" ADD CONSTRAINT "CompanyUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetenciesSubFamily" ADD CONSTRAINT "FK_competencies_subfamily_family_id" FOREIGN KEY ("familyId") REFERENCES "CompetenciesFamily"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Country" ADD CONSTRAINT "FK_countries_created_by" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Country" ADD CONSTRAINT "FK_countries_updated_by" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrencyLedger" ADD CONSTRAINT "CurrencyLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "FK_jobs_job_family_id" FOREIGN KEY ("jobFamilyId") REFERENCES "JobFamily"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobKiviat" ADD CONSTRAINT "FK_job_kiviat_job_id" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobKiviat" ADD CONSTRAINT "FK_job_kiviat_family_id" FOREIGN KEY ("competenciesFamilyId") REFERENCES "CompetenciesFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSubfamilyCompetency" ADD CONSTRAINT "JobSubfamilyCompetency_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSubfamilyCompetency" ADD CONSTRAINT "JobSubfamilyCompetency_subFamilyId_fkey" FOREIGN KEY ("subFamilyId") REFERENCES "CompetenciesSubFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSubfamilyCompetency" ADD CONSTRAINT "JobSubfamilyCompetency_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningResource" ADD CONSTRAINT "LearningResource_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningResource" ADD CONSTRAINT "LearningResource_jobFamilyId_fkey" FOREIGN KEY ("jobFamilyId") REFERENCES "JobFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningResource" ADD CONSTRAINT "LearningResource_userJobId_fkey" FOREIGN KEY ("userJobId") REFERENCES "UserJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningResource" ADD CONSTRAINT "LearningResource_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningResource" ADD CONSTRAINT "LearningResource_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "notifications_recipients_ibfk_1" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "notifications_recipients_ibfk_2" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permissions" ADD CONSTRAINT "permissions_role_id_foreign" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestDefinition" ADD CONSTRAINT "QuestDefinition_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "QuestDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestGroupItem" ADD CONSTRAINT "QuestGroupItem_questGroupId_fkey" FOREIGN KEY ("questGroupId") REFERENCES "QuestGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestGroupItem" ADD CONSTRAINT "QuestGroupItem_questDefinitionId_fkey" FOREIGN KEY ("questDefinitionId") REFERENCES "QuestDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestReward" ADD CONSTRAINT "QuestReward_questDefinitionId_fkey" FOREIGN KEY ("questDefinitionId") REFERENCES "QuestDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_jobFamilyId_fkey" FOREIGN KEY ("jobFamilyId") REFERENCES "JobFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizItem" ADD CONSTRAINT "QuizItem_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizItem" ADD CONSTRAINT "QuizItem_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizResponse" ADD CONSTRAINT "QuizResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardPurchase" ADD CONSTRAINT "RewardPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardPurchase" ADD CONSTRAINT "RewardPurchase_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "Reward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "FK_uploaded_files_created_by_id" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "FK_uploaded_files_updated_by_id" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "FK_users_role_id" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_preferredLangCode_fkey" FOREIGN KEY ("preferredLangCode") REFERENCES "Language"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "FK_users_created_by" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "FK_users_updated_by" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "FK_users_address_id" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserJob" ADD CONSTRAINT "UserJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserJob" ADD CONSTRAINT "UserJob_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserJob" ADD CONSTRAINT "UserJob_jobFamilyId_fkey" FOREIGN KEY ("jobFamilyId") REFERENCES "JobFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserJobCompetency" ADD CONSTRAINT "UserJobCompetency_userJobId_fkey" FOREIGN KEY ("userJobId") REFERENCES "UserJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserJobCompetency" ADD CONSTRAINT "UserJobCompetency_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserJobCompetencyHistory" ADD CONSTRAINT "UserJobCompetencyHistory_userJobCompetencyId_fkey" FOREIGN KEY ("userJobCompetencyId") REFERENCES "UserJobCompetency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserJobCompetencyHistory" ADD CONSTRAINT "UserJobCompetencyHistory_userQuizId_fkey" FOREIGN KEY ("userQuizId") REFERENCES "UserQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserJobKiviat" ADD CONSTRAINT "UserJobKiviat_userJobId_fkey" FOREIGN KEY ("userJobId") REFERENCES "UserJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserJobKiviat" ADD CONSTRAINT "UserJobKiviat_competenciesFamilyId_fkey" FOREIGN KEY ("competenciesFamilyId") REFERENCES "CompetenciesFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserJobKiviatHistory" ADD CONSTRAINT "UserJobKiviatHistory_userJobKiviatId_fkey" FOREIGN KEY ("userJobKiviatId") REFERENCES "UserJobKiviat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserJobKiviatHistory" ADD CONSTRAINT "UserJobKiviatHistory_userQuizId_fkey" FOREIGN KEY ("userQuizId") REFERENCES "UserQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserJobLeagueHistory" ADD CONSTRAINT "UserJobLeagueHistory_userJobId_fkey" FOREIGN KEY ("userJobId") REFERENCES "UserJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserJobQuest" ADD CONSTRAINT "UserJobQuest_userJobId_fkey" FOREIGN KEY ("userJobId") REFERENCES "UserJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserJobQuest" ADD CONSTRAINT "UserJobQuest_questDefinitionId_fkey" FOREIGN KEY ("questDefinitionId") REFERENCES "QuestDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserJobSelectedJob" ADD CONSTRAINT "UserJobSelectedJob_userJobId_fkey" FOREIGN KEY ("userJobId") REFERENCES "UserJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserJobSelectedJob" ADD CONSTRAINT "UserJobSelectedJob_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLandingModule" ADD CONSTRAINT "UserLandingModule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLandingModule" ADD CONSTRAINT "UserLandingModule_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLandingModuleEvent" ADD CONSTRAINT "UserLandingModuleEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLandingModuleEvent" ADD CONSTRAINT "UserLandingModuleEvent_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLearningResource" ADD CONSTRAINT "UserLearningResource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLearningResource" ADD CONSTRAINT "UserLearningResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "LearningResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserModule" ADD CONSTRAINT "UserModule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserModule" ADD CONSTRAINT "UserModule_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserQuest" ADD CONSTRAINT "UserQuest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserQuest" ADD CONSTRAINT "UserQuest_questDefinitionId_fkey" FOREIGN KEY ("questDefinitionId") REFERENCES "QuestDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserQuestGroup" ADD CONSTRAINT "UserQuestGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserQuestGroup" ADD CONSTRAINT "UserQuestGroup_userJobId_fkey" FOREIGN KEY ("userJobId") REFERENCES "UserJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserQuestGroup" ADD CONSTRAINT "UserQuestGroup_questGroupId_fkey" FOREIGN KEY ("questGroupId") REFERENCES "QuestGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserQuiz" ADD CONSTRAINT "UserQuiz_userJobId_fkey" FOREIGN KEY ("userJobId") REFERENCES "UserJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserQuiz" ADD CONSTRAINT "UserQuiz_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserQuizAnswer" ADD CONSTRAINT "UserQuizAnswer_userQuizId_fkey" FOREIGN KEY ("userQuizId") REFERENCES "UserQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserQuizAnswer" ADD CONSTRAINT "UserQuizAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserQuizAnswerOption" ADD CONSTRAINT "UserQuizAnswerOption_userQuizAnswerId_fkey" FOREIGN KEY ("userQuizAnswerId") REFERENCES "UserQuizAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserQuizAnswerOption" ADD CONSTRAINT "UserQuizAnswerOption_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "QuizResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStreak" ADD CONSTRAINT "UserStreak_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CompetencyFamilies" ADD CONSTRAINT "_CompetencyFamilies_A_fkey" FOREIGN KEY ("A") REFERENCES "CompetenciesFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CompetencyFamilies" ADD CONSTRAINT "_CompetencyFamilies_B_fkey" FOREIGN KEY ("B") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_JobCompetenciesFamilies" ADD CONSTRAINT "_JobCompetenciesFamilies_A_fkey" FOREIGN KEY ("A") REFERENCES "CompetenciesFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_JobCompetenciesFamilies" ADD CONSTRAINT "_JobCompetenciesFamilies_B_fkey" FOREIGN KEY ("B") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CompetenciesSubFamilies" ADD CONSTRAINT "_CompetenciesSubFamilies_A_fkey" FOREIGN KEY ("A") REFERENCES "CompetenciesSubFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CompetenciesSubFamilies" ADD CONSTRAINT "_CompetenciesSubFamilies_B_fkey" FOREIGN KEY ("B") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_JobCompetenciesSubfamilies" ADD CONSTRAINT "_JobCompetenciesSubfamilies_A_fkey" FOREIGN KEY ("A") REFERENCES "CompetenciesSubFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_JobCompetenciesSubfamilies" ADD CONSTRAINT "_JobCompetenciesSubfamilies_B_fkey" FOREIGN KEY ("B") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_JobCompetencies" ADD CONSTRAINT "_JobCompetencies_A_fkey" FOREIGN KEY ("A") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_JobCompetencies" ADD CONSTRAINT "_JobCompetencies_B_fkey" FOREIGN KEY ("B") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

