import db_service from "../services/db-service.ts";
import { PlayerService } from "../services/player-service.ts";

const player_service = new PlayerService(db_service);

export async function get(req: any, res: any, next: any) {
    try {
        res.json(await player_service.get(req.query.name));
    } catch (err) {
        console.error(`Error while getting player with name ${req.query.name}`, err.message);
        next(err);
    }
}

export async function remove(req: any, res: any, next: any) {
    try {
        res.json(await player_service.remove(req.params.name));
    }  catch (err) {
        console.error(`Error while deleting player with name ${req.params.name}`, err.message);
        next(err);
    }
}