import * as express from 'express';
import * as bot_controller from '../controllers/bot-controller.ts';

const router = express.Router();

router.post('/create', bot_controller.create);

router.post('/create/retry', bot_controller.retry);

export default router;