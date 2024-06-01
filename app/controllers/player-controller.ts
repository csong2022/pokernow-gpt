import * as player_service from '../services/player-service';

export async function get(req, res, next) {
    try {
        res.json(await player_service.get(req.query.id));
    } catch (err) {
        console.error('Error while getting player', err.message);
        next(err);
    }
}

export async function create(req, res, next) {
    try {
        res.json(await player_service.create(req.body));
    } catch (err) {
        console.error('Error while ')
    }
}