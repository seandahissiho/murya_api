import healthRoutes from "./health.routes";
import {authenticateToken} from "../utils/common";
import authRoutes from "./auth.routes";
import uploadsRoutes from "./upload.routes";
import jobsRoutes from "./jobs.routes";
import competenciesRoutes from "./competencies.routes";
import userJobsRoutes from "./userJobs.routes";
import modulesRoutes from "./modules.routes";
import questsRoutes from "./quests.routes";
import questGroupsRoutes from "./questGroups.routes";
import userJobQuestsRoutes from "./userJobQuests.routes";
import userQuestsRoutes from "./userQuests.routes";
import resourcesRoutes from "./resources.routes";


const router = require("express").Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/files", authenticateToken, uploadsRoutes);
router.use("/jobs", jobsRoutes);
router.use("/competencies", competenciesRoutes);
router.use("/userJobs", authenticateToken, userJobsRoutes);
router.use("/quests", questsRoutes);
router.use("/quest-groups", questGroupsRoutes);
router.use("/user-job-quests", userJobQuestsRoutes);
router.use("/user-quests", userQuestsRoutes);
router.use("/resources", resourcesRoutes);
router.use("/", modulesRoutes);

export default router;
