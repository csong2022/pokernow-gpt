import * as express from 'express';
import * as playerstats_controller from '../controllers/playerstats.controller.ts';

const router = express.Router();

router.get('/', playerstats_controller.get);

router.delete('/:name', playerstats_controller.remove);

export default router;