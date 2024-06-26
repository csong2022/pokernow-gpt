import * as express from 'express';
import * as player_controller from '../controllers/player-controller.ts';

const router = express.Router();

router.get('/', player_controller.get);

router.post('/', player_controller.create);

router.put('/:id', player_controller.update);

router.delete('/:id', player_controller.remove);

export default router;