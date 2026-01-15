import {Router} from 'express';
import {authenticateToken} from '../utils/common';
import * as resourceControllers from '../controllers/resources.controllers';

const router = Router();

router.post('/:id/collect', authenticateToken, resourceControllers.collectResource);

export default router;
