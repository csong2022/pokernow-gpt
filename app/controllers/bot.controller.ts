import crypto from 'crypto';

import manager_controller_ee from '../eventemitters/manager-controller.eventemitter.ts';
import { startWorker } from '../botmanager.ts';

export async function create(req: any, res: any, next: any): Promise<void> {
    try {
        const data = req.body;
        const bot_uuid = crypto.randomUUID();

        const entrysuccess_listener = () => {
            console.log("Successfully entered table:", bot_uuid);
            manager_controller_ee.off(`${bot_uuid}-entryFailure`, entryfailure_listener);
            res.json({ 'bot_uuid': bot_uuid, 'code': 'ok' });
        };
        const entryfailure_listener = (err: string) => {
            console.log("Failed to enter table:", bot_uuid);
            manager_controller_ee.off(`${bot_uuid}-entrySuccess`, entrysuccess_listener);
            res.json({ 'bot_uuid': bot_uuid, 'code': 'error', 'message': err});
        };

        manager_controller_ee.once(`${bot_uuid}-entrySuccess`, entrysuccess_listener);
        manager_controller_ee.once(`${bot_uuid}-entryFailure`, entryfailure_listener);

        await startWorker(bot_uuid, data.game_id, data.name, data.stack_size, data.ai_settings);
    } catch (err) {
        console.error(`Error while creating player.`, err.message);
        next(err);
    }
}

export async function retry(req: any, res: any, next: any): Promise<void> {
    try {
        const data = req.body;
        const bot_uuid = data.bot_uuid;
    
        manager_controller_ee.emit(`${bot_uuid}-retryEntry`, data.name, data.stack_size);
    
        const entrysuccess_listener = () => {
            console.log("Successfully entered table after retry attempt:", bot_uuid);
            manager_controller_ee.off(`${bot_uuid}-entryFailure`, entryfailure_listener);
            res.json({ 'bot_uuid': bot_uuid, 'code': 'ok' });
        };
        const entryfailure_listener = (err: string) => {
            console.log("Failed to enter table after retry attempt:", bot_uuid);
            manager_controller_ee.off(`${bot_uuid}-entrySuccess`, entrysuccess_listener);
            res.json({ 'bot_uuid': bot_uuid, 'code': 'error', 'message': err});
        };
    
        manager_controller_ee.once(`${bot_uuid}-entrySuccess`, entrysuccess_listener);
        manager_controller_ee.once(`${bot_uuid}-entryFailure`, entryfailure_listener);
    } catch (err) {
        console.error(`Error while retry creating player.`, err.message);
        next(err);
    }
}