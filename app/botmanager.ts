import crypto from 'crypto';
import path from 'path';
import { Piscina } from 'piscina';
import { fileURLToPath } from 'url';

import bot_events from './botevents.ts';

import bot_config_json from './configs/bot-config.json';
import webdriver_config_json from './configs/webdriver-config.json';

import { AIConfig, WorkerConfig } from './interfaces/config-interfaces.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const piscina = new Piscina({ filename: path.resolve(path.join(__dirname, 'worker.ts')) });

export async function startWorker(bot_uuid: crypto.UUID, game_id: string, name: string, stack_size: number, ai_config: AIConfig): Promise<void> {
    const worker_config : WorkerConfig = { bot_uuid: bot_uuid,
                                           game_id: game_id,
                                           name: name,
                                           stack_size: stack_size,
                                           ai_config: ai_config,
                                           bot_config: bot_config_json,
                                           webdriver_config: webdriver_config_json };

    piscina.on('message', (event) => {
        console.log('Messsage received from worker: ', event);
        if (event.startsWith(`${bot_uuid}-entry`)) {
            const messages = event.split("|");
            if (messages.length == 1) {
                bot_events.emit(messages[0]);
            } else if (messages.length == 2) {
                bot_events.emit(messages[0], messages[1]);
            }
        }
    });
    await piscina.run(worker_config);
    console.log("Created worker with uuid: ", bot_uuid);
}