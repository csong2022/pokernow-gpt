import dotenv from 'dotenv';
import { MessagePort } from 'worker_threads';

import { Bot } from './bot.ts'

import { DBService } from './services/db.service.ts';
import { LogService } from './services/log.service.ts';
import { PlayerStatsAPIService } from './services/api/playerstatsapi.service.ts';
import { PuppeteerService } from './services/puppeteer.service.ts';

import { AIServiceFactory } from './helpers/aiservice-factory.ts';
import { WorkerConfig } from './interfaces/config.interface.ts';
import { EntryParams } from './interfaces/message.ts';

dotenv.config();

async function startBot({ bot_uuid, game_id, name, stack_size, ai_config, bot_config, webdriver_config, port }: WorkerConfig): Promise<void> {
    const puppeteer_service = new PuppeteerService(webdriver_config.default_timeout, webdriver_config.headless_flag);
    await puppeteer_service.init();

    const db_service = new DBService("./app/pokernow-gpt.db");
    await db_service.init();

    const playerstats_api_service = new PlayerStatsAPIService(db_service);

    const log_service = new LogService(game_id);
    await log_service.init();

    const aiservice_factory = new AIServiceFactory();
    aiservice_factory.printSupportedModels();
    const ai_service = aiservice_factory.createAIService(ai_config.provider, ai_config.model_name, ai_config.playstyle);
    console.log(`Created AI service: ${ai_config.provider} ${ai_config.model_name} with playstyle: ${ai_config.playstyle}`);
    ai_service.init();

    const bot = new Bot(bot_uuid, ai_service, log_service, playerstats_api_service, puppeteer_service, game_id, bot_config.debug_mode, bot_config.query_retries);

    await bot.openGame();

    // should set a maximum number of retries
    while (true) {
        try {
            await bot.enterTableInProgress(name, stack_size);
            port.postMessage({event_name: `${bot_uuid}-entrySuccess`, msg: "success"});
            break;
        } catch (err) {
            port.postMessage({event_name: `${bot_uuid}-entryFailure`, msg: err.toString()});
            // this should probably have a setTimeout()
            const retryentry_task = (port: MessagePort): Promise<EntryParams> => 
                new Promise((resolve, reject) => 
                    port.on('message', (message: EntryParams) => resolve(message)));
            const msg: EntryParams = await retryentry_task(port);
            name = msg.name;
            stack_size = msg.stack_size;
        }
    }

    await bot.run();
}

module.exports = startBot;