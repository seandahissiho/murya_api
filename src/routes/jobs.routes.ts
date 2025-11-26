import {Router} from "express";
import * as jobControllers from "../controllers/jobs.controllers";
import {authenticateToken} from "../utils/common";

const router = Router();

router.get('/', jobControllers.searchJobs);

// get details of a job by Normalized name
router.get('/by_name/:normalizedJobName', jobControllers.getJobDetailsByName);
router.get('/:id', jobControllers.getJobDetails);
// '/jobs/$jobId/competency_families/$cfId/'
router.get('/:jobId/competency_families/:cfId/', jobControllers.getCompetencyFamilyDetailsForJob);
router.post('/', jobControllers.createJobWithCompetencies);

export default router;
