import {Router} from 'express';
import {authenticateToken} from '../utils/common';
import * as questControllers from '../controllers/quests.controllers';

const router = Router();

router.post('/:id/claim', authenticateToken, questControllers.claimQuestReward);

export default router;
