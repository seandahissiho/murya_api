import healthRoutes from "./health.routes";
import {authenticateToken} from "../utils/common";
import authRoutes from "./auth.routes";
import uploadsRoutes from "./upload.routes";
import jobsRoutes from "./jobs.routes";


const router = require("express").Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/files", authenticateToken, uploadsRoutes);
router.use("/jobs", jobsRoutes);

export default router;