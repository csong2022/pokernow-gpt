import crypto from 'crypto';

import bot_events from '../botevents.ts';
import { startWorker } from '../botmanager.ts';

export async function create(req: any, res: any, next: any): Promise<void> {
    try {
        const data = req.body;
        const bot_uuid = crypto.randomUUID();

        bot_events.once(`${bot_uuid}-entrySuccess`, () => {
            console.log("Successfully entered table: ", bot_uuid);
            res.json({ 'bot_uuid': bot_uuid, 'code': 'ok' });
        })
        bot_events.once(`${bot_uuid}-entryFailure`, () => {
            console.log("Failed to enter table: ", bot_uuid);
            res.json({ 'bot_uuid': bot_uuid, 'code': 'error'});
        })

        await startWorker(bot_uuid, data.game_id, data.name, data.stack_size, data.ai_settings);
        // doesn't return response until status of bot is confirmed?
    } catch (err) {
        console.error(`Error while creating player.`, err.message);
        next(err);
    }
}