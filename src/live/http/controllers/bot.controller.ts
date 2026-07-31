import crypto from 'crypto';

import { startWorker, getRecentDecisions } from '../../bot/bot-manager.ts';

import manager_controller_ee from '../../bot/eventemitters/manager-controller.eventemitter.ts';

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

        startWorker(bot_uuid, data.game_id, data.name, data.stack_size, data.ai_settings);
    } catch (err) {
        console.error(`Error while creating player.`, err.message);
        next(err);
    }
}

// GET /bot/:bot_uuid/stream — Server-Sent Events stream of the bot's decisions as
// they happen. One-directional (control stays on the REST create/stop/retry routes).
// Replays the recent decisions on connect (catch-up), then streams live; cleans up
// its event listener on client disconnect so listeners don't leak per bot.
export function stream(req: any, res: any): void {
    const bot_uuid = req.params.bot_uuid;

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });
    res.flushHeaders?.();

    const send = (event: string, data: unknown) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Catch-up: replay recent decisions so a mid-game client isn't blank until the
    // next decision arrives.
    for (const decision of getRecentDecisions(bot_uuid)) send('decision', decision);

    const decision_listener = (payload: unknown) => send('decision', payload);
    manager_controller_ee.on(`${bot_uuid}-decision`, decision_listener);

    // Comment ping so intermediaries don't time the idle connection out.
    const keepalive = setInterval(() => res.write(': ping\n\n'), 15000);

    req.on('close', () => {
        clearInterval(keepalive);
        manager_controller_ee.off(`${bot_uuid}-decision`, decision_listener);
        res.end();
    });
}

export async function stop(req: any, res: any, next: any): Promise<void> {
    try {
        const bot_uuid = req.body.bot_uuid;
        manager_controller_ee.emit(`${bot_uuid}-stop`);
        res.json({ bot_uuid: bot_uuid, code: 'ok' });
    } catch (err) {
        console.error(`Error while stopping bot.`, err.message);
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