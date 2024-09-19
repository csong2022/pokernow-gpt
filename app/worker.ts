import dotenv from 'dotenv';

import { Bot } from './bot.ts'

import { DBService } from './services/db-service.ts';
import { LogService } from './services/log-service.ts';
import { PlayerStatsAPIService } from './services/api/playerstats-api-service.ts';
import { PuppeteerService } from './services/puppeteer-service.ts';

import { WorkerConfig } from './interfaces/config-interfaces.ts';
import { AIServiceFactory } from './helpers/aiservice-factory.ts';

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
    while (true) {
        try {
            // need to specify errors
            await bot.enterTableInProgress(name, stack_size);
            port.postMessage(`${bot_uuid}-entrySuccess`);
            break;
        } catch (err) {
            // post message to parent (bot_manager) -> bot_manager receives message and emits event -> controller consumes event and returns response (error)
            port.postMessage(`${bot_uuid}-entryFailure|${err}`);
            // controller emits event -> bot_manager consumes event and sends message to child -> child receives message, retry enterTable 
            // program execution needs to hang here until the emitted event is received
            break;
        }
    }
    await bot.run();
}

module.exports = startBot;