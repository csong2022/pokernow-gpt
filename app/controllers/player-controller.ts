import db_service from "../services/db-service.ts";
import { PlayerAPIService } from "../services/api/playerapi-service.ts";

const playerapi_service = new PlayerAPIService(db_service);

export async function get(req: any, res: any, next: any): Promise<void> {
    try {
        res.json(await playerapi_service.get(req.query.name));
    } catch (err) {
        console.error(`Error while getting player with name ${req.query.name}`, err.message);
        next(err);
    }
}

export async function remove(req: any, res: any, next: any): Promise<void> {
    try {
        res.json(await playerapi_service.remove(req.params.name));
    }  catch (err) {
        console.error(`Error while deleting player with name ${req.params.name}`, err.message);
        next(err);
    }
}