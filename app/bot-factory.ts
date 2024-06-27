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

    console.log("Getting game info.");
    const res = await puppeteer_service.getGameInfo();
    logResponse(res, debug_mode);
    if (res.code == "success") {
        const game_info = puppeteer_service.convertGameInfo(res.data as string);
        return new Game(game_id, game_info.stakes, game_info.game_type, 30);
    } else {
        throw new Error ("Failed to get game info.");
    }
}


const bot_factory = async function() {
    const game = await init();
    const bot = new Bot(debug_mode, game);
    await bot.run();
}

export default bot_factory;