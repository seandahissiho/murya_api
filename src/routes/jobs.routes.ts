import {Router} from "express";
import * as jobControllers from "../controllers/jobs.controllers";

const router = Router();

router.get('/', jobControllers.searchJobs);

// get details of a job by Normalized name
router.get('/by_name/:normalizedJobName', jobControllers.getJobDetailsByName);
router.post('/:normalizedJobName/positioning-quizzes', jobControllers.savePositioningQuizzesForJob);
router.get('/:id', jobControllers.getJobDetails);
// '/jobs/$jobId/competency_families/$cfId/'
router.get('/:jobId/competency_families/:cfId/', jobControllers.getCompetencyFamilyDetailsForJob);
router.post('/', jobControllers.createJobWithCompetencies);

export default router;
