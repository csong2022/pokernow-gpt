import prompt from 'prompt-sync';
import * as puppeteer_service from './services/puppeteer-service.ts';
import { Bot } from './bot.ts'
import { logResponse, DebugMode } from './utils/error-handling-utils.ts';
import { Game } from './models/game.ts';

const debug_mode = DebugMode.CONSOLE;
const io = prompt();

async function init(): Promise<Game> {
    
    const game_id = io("Enter the PokerNow game id (ex. https://www.pokernow.club/games/{game_id}): ");
    console.log(`The PokerNow game with id: ${game_id} will now open.`);
    
    logResponse(await puppeteer_service.init(game_id), debug_mode);

    logResponse(await puppeteer_service.waitForGameInfo(), debug_mode);

    var res, game_info_data;
    console.log("Getting game info.");
    res = await puppeteer_service.getGameInfo();
    logResponse(res, debug_mode);
    if (res.code == "success") {
        game_info_data = res.data;
    }
    const game_info_obj = puppeteer_service.convertGameInfo(String(game_info_data));
    return new Game(game_id, game_info_obj.stakes, game_info_obj.game_type)
}

const bot_factory = async function() {
    const game = await init();
    const bot = new Bot(debug_mode, game);
    await bot.run();
}

export default bot_factory;