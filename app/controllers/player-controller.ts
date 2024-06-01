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
        console.error('Error while creating player', err.message);
        next(err);
    }
}

export async function update(req, res, next) {
    try {
        res.json(await player_service.update(req.params.id, req.body));
    } catch (err) {
        console.error('Error while updating player', err.message);
        next(err);
    }
}

export async function remove(req, res, next) {
    try {
        res.json(await player_service.remove(req.params.id));
    }  catch (err) {
        console.error('Error while deleting player', err.message);
        next(err);
    }
}