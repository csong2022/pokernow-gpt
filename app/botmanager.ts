import crypto from 'crypto';
import path from 'path';
import { Piscina } from 'piscina';
import { fileURLToPath } from 'url';
import { MessageChannel } from 'worker_threads';

import bot_events from './botevents.ts';

import bot_config_json from './configs/bot-config.json';
import webdriver_config_json from './configs/webdriver-config.json';

import { AIConfig, WorkerConfig } from './interfaces/config-interfaces.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const piscina = new Piscina({ filename: path.resolve(path.join(__dirname, 'worker.ts')) });

export async function startWorker(bot_uuid: crypto.UUID, game_id: string, name: string, stack_size: number, ai_config: AIConfig): Promise<void> {
    const channel = new MessageChannel();
    const worker_config : WorkerConfig = { bot_uuid: bot_uuid,
                                           game_id: game_id,
                                           name: name,
                                           stack_size: stack_size,
                                           ai_config: ai_config,
                                           bot_config: bot_config_json,
                                           webdriver_config: webdriver_config_json,
                                           port: channel.port1
                                        };
    const retryentry_listener = (name: string, stack_size: number) => {
        channel.port2.postMessage({name: name, stack_size: stack_size})
    };
    channel.port2.on('message', (message: {event_name: string, msg: string}) => {
        console.log('Messsage received from worker:', message);
        if (message.event_name === `${bot_uuid}-entrySuccess`) {
            bot_events.off(`${bot_uuid}-retryEntry`, retryentry_listener);
        }
        bot_events.emit(message.event_name, message.msg);
    });
    bot_events.on(`${bot_uuid}-retryEntry`, retryentry_listener);
    
    await piscina.run(worker_config, {transferList: [channel.port1]});
}