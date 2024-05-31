import * as express from 'express';
import * as player_controller from '../controllers/player-controller.ts';

export const router = express.Router();

router.get('/', player_controller.get);