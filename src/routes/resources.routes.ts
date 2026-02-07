import {Router} from 'express';
import {authenticateToken} from '../utils/common';
import * as resourceControllers from '../controllers/resources.controllers';

const router = Router();

router.post('/:id/collect', authenticateToken, resourceControllers.collectResource);
router.post('/:id/open', authenticateToken, resourceControllers.openResource);
router.post('/:id/read', authenticateToken, resourceControllers.readResource);
router.post('/:id/like', authenticateToken, resourceControllers.likeResource);

export default router;
