import {Router} from "express";
import * as jobControllers from "../controllers/user_jobs.controllers";
import {authenticateToken} from "../utils/common";

const router = Router();

// retrieveDailyQuizForJob
router.get('/:jobId/quiz/', authenticateToken, jobControllers.retrieveDailyQuizForJob);
// saveDailyQuizAnswers
router.post('/:jobId/quiz/:quizId', authenticateToken, jobControllers.saveDailyQuizAnswers);
// getUserJob
router.get('/:jobId', authenticateToken, jobControllers.getUserJob);


export default router;
