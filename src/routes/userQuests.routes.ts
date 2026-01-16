import {authenticateToken} from "../utils/common";
import * as questControllers from '../controllers/quests.controllers';

const router = require("express").Router();

router.post('/:id/claim', authenticateToken, questControllers.claimUserQuestReward);

export default router;
