import prompt from 'prompt-sync';

import { Bot } from './bot.ts'

import bot_config_json from "./configs/bot-config.json"

import { DBService } from './services/db-service.ts';
import { LogService } from './services/log-service.ts';
import { OpenAIService } from './services/openai-service.ts';
import { PlayerService } from './services/player-service.ts';
import { PuppeteerService } from './services/puppeteer-service.ts';

import { BotConfig } from './utils/config-utils.ts';

const io = prompt();
const bot_config: BotConfig = bot_config_json;

function init(): string {
    return io("Enter the PokerNow game id (ex. https://www.pokernow.club/games/{game_id}): ");
}

const bot_factory = async function() {
    const game_id = init();

    const puppeteer_service = new PuppeteerService(1000);
    await puppeteer_service.init();

    const db_service = new DBService("./app/pokernow-gpt.db");
    await db_service.init();

    const player_service = new PlayerService(db_service);

    const log_service = new LogService(game_id);
    await log_service.init();

    const openai_service = new OpenAIService();
    await openai_service.init();

    const bot = new Bot(log_service, openai_service, player_service, puppeteer_service, game_id, bot_config);
    await bot.run();
}

export default bot_factory;