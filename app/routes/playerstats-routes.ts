import * as express from 'express';
import * as player_controller from '../controllers/player-controller.ts';

const router = express.Router();

router.get('/', player_controller.get);

router.delete('/:name', player_controller.remove);

export default router;