import {Router} from "express";
import * as jobControllers from "../controllers/user_jobs.controllers";
import {authenticateToken} from "../utils/common";

const router = Router();

//retrive user's current UserJob
router.get('/current', authenticateToken, jobControllers.retrieveCurrentUserJob);
// set current UserJob by jobFamilyId
router.post('/current/family/:jobFamilyId', authenticateToken, jobControllers.setCurrentUserJobFamily);
// set current UserJob by jobId
router.post('/current/:jobId', authenticateToken, jobControllers.setCurrentUserJob);
// saveDailyQuizAnswers
router.post('/:jobId/quiz/:quizId', authenticateToken, jobControllers.saveDailyQuizAnswers);
// retrieveDailyQuizForJob
router.get('/:jobId/quiz/', authenticateToken, jobControllers.retrieveDailyQuizForJob);

router.get('/leaderboard/job/:jobId', authenticateToken, jobControllers.getJobLeaderboard);

router.get('/:userJobId/resources', authenticateToken, jobControllers.listLearningResourcesForUserJob);
// update selected jobs for a job family track
router.put('/:userJobId/selected-jobs', authenticateToken, jobControllers.updateUserJobFamilySelection);

//getUserJobCompetencyProfileHandler
router.get('/:userJobId/competenciesProfile', authenticateToken, jobControllers.getUserJobCompetencyProfileHandler);
// previewCompetencyProfile
router.get('/:userJobId/previewCompetencyProfile', authenticateToken, jobControllers.previewCompetencyProfile);
// '/userJobs/$userJobId/competency_families/$cfId/'
router.get('/:userJobId/competency_families/:cfId/', authenticateToken, jobControllers.getCompetencyFamilyDetailsForUserJob);
// getUserJob
router.get('/:jobId', authenticateToken, jobControllers.getUserJob);
// generateMarkdownArticleForLastQuiz2
router.post('/generateArticle/:userJobId', authenticateToken, jobControllers.generateMarkdownArticleForLastQuiz2);


export default router;
