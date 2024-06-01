import * as express from 'express';
import * as player_controller from '../controllers/player-controller.ts';

var router = express.Router();

router.get('/', player_controller.get);

router.post('/', player_controller.create);

export default router;