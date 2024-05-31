const router = express.Router();
import player_controller from '../controllers/player-controller.ts';

router.get('', player_controller.get);

module.exports = router;