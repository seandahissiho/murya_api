import {Router} from 'express';
import {authenticateToken} from '../utils/common';
import {streamRealtime} from '../realtime/realtime.controller';

const router = Router();

router.get('/stream', authenticateToken, streamRealtime);

export default router;
