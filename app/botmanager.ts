import path from 'path';
import { Piscina } from 'piscina';
import { fileURLToPath } from 'url';

import ai_config_json from './configs/ai-config.json';
import bot_config_json from './configs/bot-config.json';
import webdriver_config_json from './configs/webdriver-config.json';

import { WorkerConfig } from './interfaces/config-interfaces.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const piscina = new Piscina({ filename: path.resolve(path.join(__dirname, 'worker.ts')) });

export async function createWorker(game_id: string): Promise<void> {
    console.log("Creating worker!");
    const worker_config : WorkerConfig = { game_id: game_id, ai_config: ai_config_json, bot_config: bot_config_json, webdriver_config: webdriver_config_json };
    await piscina.run(worker_config);
}

// TODO: create event emitters to spawn multi processes (bots)
// ---
// TOP-LEVEL event emitter (index.ts)
// emit event from POST request to initialize new bot_manager in index.ts -> creates bot_manager with specified game_id 
// ---
// bot manager event emitter