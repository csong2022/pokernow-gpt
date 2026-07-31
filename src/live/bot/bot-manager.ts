import crypto from 'crypto';
import path from 'path';
import { Piscina } from 'piscina';
import { fileURLToPath } from 'url';
import { MessageChannel } from 'worker_threads';

import bot_config_json from '../../config/bot.config.json' with { type: "json" };
import webdriver_config_json from '../../config/webdriver.config.json' with { type: "json" };

import manager_controller_ee from './eventemitters/manager-controller.eventemitter.ts';

import { WorkerConfig } from '../../interfaces/config.interface.ts';
import { AIConfig } from '../../core/ai/ai-config.interface.ts';
import { BoundedSet } from '../../utils/data-structures.util.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const piscina = new Piscina({ filename: path.resolve(path.join(__dirname, 'worker.ts')) });

const SEEN_HANDS_LIMIT = 100;
const seen_hands_per_game = new Map<string, BoundedSet<string>>();

// Recent decisions per bot, for SSE catch-up: a client connecting mid-game gets the
// last N decisions, then live. Bounded ring buffer keyed by bot_uuid; cleared when
// the bot's worker finishes.
const RECENT_DECISIONS_LIMIT = 20;
const recent_decisions = new Map<string, unknown[]>();

export function getRecentDecisions(bot_uuid: string): unknown[] {
    return recent_decisions.get(bot_uuid) ?? [];
}

export function startWorker(bot_uuid: crypto.UUID, game_id: string, name: string, stack_size: number, ai_config: AIConfig): void {
    const channel = new MessageChannel();
    const worker_config: WorkerConfig = { bot_uuid: bot_uuid,
                                          game_id: game_id,
                                          name: name,
                                          stack_size: stack_size,
                                          ai_config: ai_config,
                                          bot_config: bot_config_json,
                                          webdriver_config: webdriver_config_json,
                                          port: channel.port1
                                       };
    if (!seen_hands_per_game.has(game_id)) {
        seen_hands_per_game.set(game_id, new BoundedSet<string>(SEEN_HANDS_LIMIT));
    }
    const seen_hands = seen_hands_per_game.get(game_id)!;

    const retryentry_listener = (name: string, stack_size: number) => {
        channel.port2.postMessage({name: name, stack_size: stack_size});
    };
    const stop_listener = () => {
        channel.port2.postMessage({event_name: 'stop'});
    };
    channel.port2.on('message', (message: { event_name: string, msg: string, payload?: unknown, first_created: string }) => {
        console.log('Message received from worker:', message);
        if (message.event_name === 'requestProcessPlayers') {
            const allowed = !seen_hands.has(message.first_created);
            if (allowed) seen_hands.add(message.first_created);
            channel.port2.postMessage({ event_name: 'processPlayersResponse', allowed });
            return;
        }
        if (message.event_name === `${bot_uuid}-entrySuccess`) {
            manager_controller_ee.off(`${bot_uuid}-retryEntry`, retryentry_listener);
        }
        // Buffer decisions for mid-game SSE catch-up (bounded ring buffer).
        if (message.event_name === `${bot_uuid}-decision`) {
            let buf = recent_decisions.get(bot_uuid);
            if (!buf) { buf = []; recent_decisions.set(bot_uuid, buf); }
            buf.push(message.payload);
            if (buf.length > RECENT_DECISIONS_LIMIT) buf.shift();
        }
        // Streamed events (decisions, lifecycle) carry a structured `payload`;
        // entrySuccess/entryFailure carry a string `msg`. Forward whichever is set so
        // the SSE endpoint receives the full decision object while existing string
        // listeners keep working unchanged.
        manager_controller_ee.emit(message.event_name, message.payload ?? message.msg);
    });
    manager_controller_ee.on(`${bot_uuid}-retryEntry`, retryentry_listener);
    manager_controller_ee.on(`${bot_uuid}-stop`, stop_listener);

    const cleanup = () => {
        manager_controller_ee.off(`${bot_uuid}-retryEntry`, retryentry_listener);
        manager_controller_ee.off(`${bot_uuid}-stop`, stop_listener);
        channel.port2.removeAllListeners('message');
        recent_decisions.delete(bot_uuid);
    };

    piscina.run(worker_config, {transferList: [channel.port1]})
        .then(cleanup)
        .catch((err: unknown) => {
            cleanup();
            manager_controller_ee.emit(`${bot_uuid}-entryFailure`, err instanceof Error ? err.message : String(err));
        });
}