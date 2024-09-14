import db_service from "../services/db-service.ts";
import { PlayerStatsAPIService } from "../services/api/playerstats-api-service.ts";

const playerstatsapi_service = new PlayerStatsAPIService(db_service);

export async function get(req: any, res: any, next: any): Promise<void> {
    try {
        res.json(await playerstatsapi_service.get(req.query.name));
    } catch (err) {
        console.error(`Error while getting stats for player with name ${req.query.name}`, err.message);
        next(err);
    }
}

export async function remove(req: any, res: any, next: any): Promise<void> {
    try {
        res.json(await playerstatsapi_service.remove(req.params.name));
    }  catch (err) {
        console.error(`Error while deleting stats for player with name ${req.params.name}`, err.message);
        next(err);
    }
}