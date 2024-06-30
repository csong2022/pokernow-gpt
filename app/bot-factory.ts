import prompt from 'prompt-sync';
import { PuppeteerService } from './services/puppeteer-service.ts';
import { Bot } from './bot.ts'
import { logResponse } from './utils/error-handling-utils.ts';
import { Game } from './models/game.ts';
import { BotConfig } from './utils/config-utils.ts';
import bot_config_json from "./configs/bot-config.json"
import { LogService } from './services/log-service.ts';

const io = prompt();
const bot_config: BotConfig = bot_config_json;
let game_id = "";

async function init(puppeteer_service: PuppeteerService): Promise<Game> {
    game_id = io("Enter the PokerNow game id (ex. https://www.pokernow.club/games/{game_id}): ");
    console.log(`The PokerNow game with id: ${game_id} will now open.`);
    
    logResponse(await puppeteer_service.navigateToGame(game_id), bot_config.debug_mode);
    logResponse(await puppeteer_service.waitForGameInfo(), bot_config.debug_mode);

    console.log("Getting game info.");
    const res = await puppeteer_service.getGameInfo();
    logResponse(res, bot_config.debug_mode);
    if (res.code == "success") {
        const game_info = puppeteer_service.convertGameInfo(res.data as string);
        return new Game(game_id, game_info.big_blind, game_info.small_blind, game_info.game_type, 30);
    } else {
        throw new Error ("Failed to get game info.");
    }
}

const bot_factory = async function() {
    const puppeteer_service = new PuppeteerService(1000);
    await puppeteer_service.init();
    const log_service = new LogService(game_id);
    await log_service.init();
    const game = await init(puppeteer_service);
    const bot = new Bot(log_service, puppeteer_service, game, bot_config.debug_mode, bot_config.query_retries);
    await bot.run();
}

export default bot_factory;