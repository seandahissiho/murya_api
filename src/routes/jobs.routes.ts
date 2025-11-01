import {Router} from "express";
import * as jobControllers from "../controllers/jobs.controllers";
import {authenticateToken} from "../utils/common";

const router = Router();

router.get('/', jobControllers.searchJobs);
router.get('/:id', jobControllers.getJobDetails);
// '/jobs/$jobId/competency_families/$cfId/'
router.get('/:jobId/competency_families/:cfId/', jobControllers.getCompetencyFamilyDetailsForJob);

export default router;
