import {Router} from 'express';
import {authenticateToken} from '../utils/common';
import {globalSearchHandler} from '../controllers/search.controllers';

const router = Router();

router.get('/', authenticateToken, globalSearchHandler);

export default router;
