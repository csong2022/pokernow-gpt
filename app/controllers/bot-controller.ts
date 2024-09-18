import { createWorker } from "../botmanager.ts";

export async function create(req: any, res: any, next: any): Promise<void> {
    try {
        const data = req.body;
        createWorker(data.game_id);
        res.json(data.game_id);
    } catch (err) {
        console.error(`Error while creating player.`, err.message);
        next(err);
    }
}