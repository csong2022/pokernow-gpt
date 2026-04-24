import dotenv from 'dotenv';
import EventEmitter from 'events';
import { MessagePort } from 'worker_threads';

import { Bot } from './bot.ts'

import bot_worker_ee from './eventemitters/bot-worker.eventemitter.ts';

import { AIServiceFactory } from '../services/ai/ai-service-factory.helper.ts';

import { WorkerConfig } from '../interfaces/config.interface.ts';
import { EntryParams, ProcessPlayersResponse, RequestProcessPlayers } from '../interfaces/message.interface.ts';

import { DBService } from '../services/db/db.service.ts';
import { LogService } from '../services/logs/log.service.ts';
import { PlayerStatsAPIService } from '../services/db/playerstatsapi.service.ts';
import { PuppeteerService } from '../services/puppeteer/puppeteer.service.ts';

dotenv.config();

async function startBot({ bot_uuid, game_id, name, stack_size, ai_config, bot_config, webdriver_config, port }: WorkerConfig): Promise<void> {
    const puppeteer_service = new PuppeteerService(webdriver_config.default_timeout, webdriver_config.headless_flag);
    await puppeteer_service.init();

    const db_service = new DBService("./pokernow-gpt.db");
    await db_service.init();

    const playerstats_api_service = new PlayerStatsAPIService(db_service);

    const log_service = new LogService(game_id);
    await log_service.init();

    const ai_service_factory = new AIServiceFactory();
    ai_service_factory.printSupportedModels();
    const ai_service = ai_service_factory.createAIService(ai_config.provider, ai_config.model_name, ai_config.playstyle);
    console.log(`Created AI service: ${ai_config.provider} ${ai_config.model_name} with playstyle: ${ai_config.playstyle}`);
    ai_service.init();

    const bot = new Bot(bot_uuid, ai_service, log_service, playerstats_api_service, puppeteer_service, game_id, bot_config.debug_mode, bot_config.query_retries);

    await bot.openGame();

    //TODO: set a maximum number of retries
    while (true) {
        try {
            await bot.enterTableInProgress(name, stack_size);
            port.postMessage({event_name: `${bot_uuid}-entrySuccess`, msg: "success"});
            break;
        } catch (err) {
            port.postMessage({event_name: `${bot_uuid}-entryFailure`, msg: err.toString()});
            //TODO: add a setTimeout()
            const retryentry_task = (port: MessagePort): Promise<EntryParams> =>
                new Promise((resolve, reject) =>
                    port.once('message', (message: EntryParams) => resolve(message)));
            const msg: EntryParams = await retryentry_task(port);
            name = msg.name;
            stack_size = msg.stack_size;
        }
    }

    const port_ee = new EventEmitter();
    port.on('message', (message: { event_name: string }) => {
        port_ee.emit(message.event_name, message);
    });
    port_ee.on('stop', () => bot.stop());

    const process_players_guard = (first_created: string): Promise<boolean> =>
        new Promise((resolve) => {
            port.postMessage({ event_name: 'requestProcessPlayers', first_created } as RequestProcessPlayers);
            port_ee.once('processPlayersResponse', (msg: ProcessPlayersResponse) => resolve(msg.allowed));
        });

    try {
        await bot.run(process_players_guard);
    } finally {
        console.log(`Bot "${name}" shutting down — closing resources.`);
        try { await puppeteer_service.closeBrowser(); } catch (err) { console.log("Error closing puppeteer browser:", err); }
        try { await log_service.closeBrowser(); } catch (err) { console.log("Error closing log service browser:", err); }
        try { db_service.close(); } catch (err) { console.log("Error closing db:", err); }
    }
}

export default startBot;