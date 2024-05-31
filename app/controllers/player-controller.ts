import player_service from '../services/player-service';

async function get(req, res, next) {
    try {
        res.json(await player_service.get());
    } catch (err) {
        console.error('Error while getting player', err.message);
        next(err);
    }
}

module.exports = {
    get
}