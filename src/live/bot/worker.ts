import dotenv from 'dotenv';
import EventEmitter from 'events';
import { MessagePort } from 'worker_threads';

import { Bot } from './bot.ts'

import bot_worker_ee from './eventemitters/bot-worker.eventemitter.ts';

import { AIServiceFactory } from '../../core/ai/ai-service-factory.helper.ts';

import { WorkerConfig } from '../../interfaces/config.interface.ts';
import { EntryParams, ProcessPlayersResponse, RequestProcessPlayers } from '../../interfaces/message.interface.ts';

import { DBService } from '../../services/db/db.service.ts';
import { LogService } from '../pokernow/log.service.ts';
import { HandOutcomesAPIService } from '../../services/db/handoutcomes.service.ts';
import { PlayerStatsAPIService } from '../../services/db/playerstatsapi.service.ts';
import { PuppeteerService } from '../pokernow/puppeteer.service.ts';

import { Logger } from '../../utils/logger.util.ts';

dotenv.config();

async function startBot({ bot_uuid, game_id, name, stack_size, ai_config, bot_config, webdriver_config, port }: WorkerConfig): Promise<void> {
    const logger = new Logger(bot_uuid, ai_config.model_name);

    const puppeteer_service = new PuppeteerService(webdriver_config.default_timeout, webdriver_config.headless_flag);
    await puppeteer_service.init();

    const db_service = new DBService("./pokernow-gpt.db");
    await db_service.init();
    db_service.createTables();

    const playerstats_api_service = new PlayerStatsAPIService(db_service);
    const hand_outcomes_api_service = new HandOutcomesAPIService(db_service);

    // LogService fetches the log API from the shared game page (same-origin), so it
    // needs no browser of its own.
    const log_service = new LogService(game_id);
    await log_service.init(puppeteer_service.getPage());

    // Derive the per-decision timing budget from the table's action clock so a
    // decision (log fetch + reasoning query + execution) finishes within it. Reserve
    // headroom for the fetch, the click, and a safety margin; the AI query gets the
    // rest. Small fixed pacing sleeps replace the old fixed 2s waits.
    const RESERVE_MS = 5000;
    const PACING_MS = 500;
    const action_timer_ms = (webdriver_config.action_timer_secs ?? 20) * 1000;
    const query_timeout_ms = Math.max(action_timer_ms - RESERVE_MS, 5000);
    const query_delay_ms = PACING_MS;
    const fetch_sleep_ms = PACING_MS;
    logger.info(`Timing budget (action clock ${action_timer_ms}ms): query timeout ${query_timeout_ms}ms, pacing ${PACING_MS}ms.`);

    const ai_service_factory = new AIServiceFactory();
    const ai_service = ai_service_factory.createAIService(ai_config.provider, ai_config.model_name, ai_config.playstyle, ai_config.reasoning ?? 'none', '', query_timeout_ms);
    logger.info(`Created AI service: ${ai_config.provider} ${ai_config.model_name} with playstyle: ${ai_config.playstyle}`);
    ai_service.init();

    const bot = new Bot(bot_uuid, ai_service, ai_config, log_service, playerstats_api_service, hand_outcomes_api_service, puppeteer_service, logger, game_id, bot_config.debug_mode, bot_config.query_retries, query_delay_ms, fetch_sleep_ms);

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
        logger.info(`Bot "${name}" shutting down — closing resources.`);
        try { await puppeteer_service.closeBrowser(); } catch (err) { logger.error("Error closing puppeteer browser:", err); }
        try { await log_service.closeBrowser(); } catch (err) { logger.error("Error closing log service browser:", err); }
        try { db_service.close(); } catch (err) { logger.error("Error closing db:", err); }
    }
}

export default startBot;