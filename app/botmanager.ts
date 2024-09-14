import dotenv from 'dotenv';
import prompt from 'prompt-sync';

import { Bot } from './bot.ts'

import ai_config_json from './configs/ai-config.json';
import bot_config_json from './configs/bot-config.json';
import webdriver_config_json from './configs/webdriver-config.json';

import { DBService } from './services/db-service.ts';
import { LogService } from './services/log-service.ts';
import { PlayerStatsAPIService } from './services/api/playerstats-api-service.ts';
import { PuppeteerService } from './services/puppeteer-service.ts';

import { AIConfig, BotConfig, WebDriverConfig } from './interfaces/config-interfaces.ts';
import { AIServiceFactory } from './helpers/aiservice-factory.ts';

const ai_config: AIConfig = ai_config_json;
const bot_config: BotConfig = bot_config_json;
const webdriver_config: WebDriverConfig = webdriver_config_json;

function init(): void {
    dotenv.config();
}

// TODO: create event emitters to spawn multi processes (bots)
// ---
// TOP-LEVEL event emitter (index.ts)
// emit event from POST request to initialize new bot_manager in index.ts -> creates bot_manager with specified game_id
// ---
// bot manager event emitter
// emit event from POST request to create new bot in index.ts -> creates new bot with unique bot_id (need to determine what to use as bot_id), maybe also define name and initial stack size here

const bot_manager = async function(game_id: string): Promise<void> {
    init();

    const puppeteer_service = new PuppeteerService(webdriver_config.default_timeout, webdriver_config.headless_flag);
    await puppeteer_service.init();

    const db_service = new DBService("./app/pokernow-gpt.db");
    await db_service.init();

    const playerstatsapi_service = new PlayerStatsAPIService(db_service);

    const log_service = new LogService(game_id);
    await log_service.init();

    const aiservice_factory = new AIServiceFactory();
    aiservice_factory.printSupportedModels();
    const ai_service = aiservice_factory.createAIService(ai_config.provider, ai_config.model_name, ai_config.playstyle);
    console.log(`Created AI service: ${ai_config.provider} ${ai_config.model_name} with playstyle: ${ai_config.playstyle}`);
    ai_service.init();

    const bot = new Bot(log_service, ai_service, playerstatsapi_service, puppeteer_service, game_id, bot_config.debug_mode, bot_config.query_retries);
    await bot.run();
}

export default bot_manager;