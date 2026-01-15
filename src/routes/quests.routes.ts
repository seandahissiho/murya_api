import {Router} from 'express';
import {authenticateToken} from '../utils/common';
import * as questControllers from '../controllers/quests.controllers';

const router = Router();

router.get('/', authenticateToken, questControllers.listQuests);

export default router;
