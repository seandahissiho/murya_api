import {authenticateToken} from "../utils/common";
import * as questControllers from '../controllers/quests.controllers';

const router = require("express").Router();

router.get('/', authenticateToken, questControllers.listQuestGroups);

export default router;
