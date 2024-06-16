import prompt from 'prompt-sync';
import * as puppeteer_service from './app/services/puppeteer-service.ts';
import { Bot } from './bot.ts'
import { logResponse, DebugMode } from './app/utils/error-handling-utils.ts';
import { Game } from './app/models/game.ts';

const debug_mode = DebugMode.CONSOLE;
const io = prompt();
var game_id: string, game: Game;

async function init() {
    game_id = io("Enter the PokerNow game id (ex. https://www.pokernow.club/games/{game_id}): ");
    console.log(`The PokerNow game with id: ${game_id} will now open.`);
    logResponse(await puppeteer_service.init(game_id), debug_mode);

    var res, game_info_data;
    res = await puppeteer_service.getGameInfo();
    logResponse(res, debug_mode);
    if (res.code == "success") {
        game_info_data = res.data;
    }
    const game_info_obj = puppeteer_service.convertGameInfo(String(game_info_data));
    game = new Game(game_id, game_info_obj.stakes, game_info_obj.game_type)
}

const bot_factory = async function() {
    await init();
    const bot = new Bot(debug_mode, game);
    await bot.run();
}

export default bot_factory;