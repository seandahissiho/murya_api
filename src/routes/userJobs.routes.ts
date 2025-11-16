import {Router} from "express";
import * as jobControllers from "../controllers/user_jobs.controllers";
import {authenticateToken} from "../utils/common";

const router = Router();

//retrive user's current UserJob
router.get('/current', authenticateToken, jobControllers.retrieveCurrentUserJob);
// saveDailyQuizAnswers
router.post('/:jobId/quiz/:quizId', authenticateToken, jobControllers.saveDailyQuizAnswers);
// retrieveDailyQuizForJob
router.get('/:jobId/quiz/', authenticateToken, jobControllers.retrieveDailyQuizForJob);

router.get('/leaderboard/job/:jobId', authenticateToken, jobControllers.getJobLeaderboard);

//getUserJobCompetencyProfileHandler
router.get('/:jobId/competenciesProfile', authenticateToken, jobControllers.getUserJobCompetencyProfileHandler);
// getUserJob
router.get('/:jobId', authenticateToken, jobControllers.getUserJob);


export default router;
