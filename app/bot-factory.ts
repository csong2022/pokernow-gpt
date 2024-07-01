import dotenv from 'dotenv';
import prompt from 'prompt-sync';

import { Bot } from './bot.ts'

import ai_config_json from './configs/ai-config.json';
import bot_config_json from './configs/bot-config.json';
import webdriver_config_json from './configs/webdriver-config.json';

import { DBService } from './services/db-service.ts';
import { LogService } from './services/log-service.ts';
import { PlayerService } from './services/player-service.ts';
import { PuppeteerService } from './services/puppeteer-service.ts';

import { AIConfig, BotConfig, WebDriverConfig } from './interfaces/config-interfaces.ts';
import { AIServiceFactory } from './helpers/ai-service-factory.ts';

const io = prompt();
const ai_config: AIConfig = ai_config_json;
const bot_config: BotConfig = bot_config_json;
const webdriver_config: WebDriverConfig = webdriver_config_json;

function init(): string {
    dotenv.config();
    return io("Enter the PokerNow game id (ex. https://www.pokernow.club/games/{game_id}): ");
}

const bot_factory = async function() {
    const game_id = init();

    const puppeteer_service = new PuppeteerService(webdriver_config.default_timeout, webdriver_config.headless_flag);
    await puppeteer_service.init();

    const db_service = new DBService("./app/pokernow-gpt.db");
    await db_service.init();

    const player_service = new PlayerService(db_service);

    const log_service = new LogService(game_id);
    await log_service.init();

    const ai_service_factory = new AIServiceFactory();
    ai_service_factory.printSupportedModels();
    const ai_service = ai_service_factory.createAIService(ai_config.provider, ai_config.model_name);
    console.log(`Created AI service: ${ai_config.provider} ${ai_config.model_name}`);
    ai_service.init();

    const bot = new Bot(log_service, ai_service, player_service, puppeteer_service, game_id, bot_config.debug_mode, bot_config.query_retries);
    await bot.run();
}

export default bot_factory;