import * as express from 'express';
import * as bot_controller from '../controllers/bot-controller.ts';

const router = express.Router();

router.post('/create', bot_controller.create);

export default router;