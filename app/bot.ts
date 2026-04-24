import crypto from 'crypto';

import bot_worker_ee from './eventemitters/bot-worker.eventemitter.ts';

import { sleep } from './helpers/bot-timeout.helper.ts';
import { constructQuery } from './helpers/query-construction.helper.ts';

import { AIService, BotAction, defaultCheckAction, defaultFoldAction } from './interfaces/ai-client.interface.ts';
import { ProcessedLogs } from './interfaces/log-processing.interface.ts';

import { Game } from './models/game.model.ts';
import { Table } from './models/table.model.ts';

import { LogService } from './services/log.service.ts';
import { PlayerStatsAPIService } from './services/api/playerstatsapi.service.ts';
import { PuppeteerService } from './services/puppeteer.service.ts';

import { DebugMode, ErrorResponse, logResponse, SuccessResponse } from './utils/error-handling.util.ts';
import { postProcessLogs, postProcessLogsAfterHand, preProcessLogs } from './utils/log-processing.util.ts';
import { getIdToInitialStackFromMsg, getIdToNameFromMsg, getIdToTableSeatFromMsg, getNameToIdFromMsg, getPlayerStacksMsg, getTableSeatToIdFromMsg, validateAllMsg } from './utils/message-processing.util.ts';
import { convertToBBs, convertToValue } from './utils/value-conversion.util.ts'

type ProcessPlayersGuard = (first_created: string) => Promise<boolean>;

export class Bot {
    private bot_uuid: crypto.UUID;

    private ai_service: AIService;
    private log_service: LogService;
    private player_service: PlayerStatsAPIService;
    private puppeteer_service: PuppeteerService;

    private game_id: string;
    private debug_mode: DebugMode;
    private query_retries: number;

    private active: boolean;
    private first_created: string;
    private hand_number: number;

    private table!: Table;
    private game!: Game;
    private bot_name!: string;

    constructor(bot_uuid: crypto.UUID,
                ai_service: AIService,
                log_service: LogService, 
                player_service: PlayerStatsAPIService,
                puppeteer_service: PuppeteerService,
                game_id: string,
                debug_mode: DebugMode,
                query_retries: number) 
    {
        this.bot_uuid = bot_uuid;

        this.ai_service = ai_service;
        this.log_service = log_service;
        this.player_service = player_service;
        this.puppeteer_service = puppeteer_service;

        this.game_id = game_id;
        this.debug_mode = debug_mode;
        this.query_retries = query_retries;

        this.active = true;
        this.first_created = "";
        this.hand_number = 1;
    }

    //TODO:
    //report bot status
    //rebuys

    public stop(): void {
        this.active = false;
    }

    public async run(process_players_guard?: ProcessPlayersGuard) {
        logResponse(await this.puppeteer_service.openLogPanel(), this.debug_mode);
        try {
            const hand_info_res = await this.puppeteer_service.getStartingHandInfo();
            if (hand_info_res.code === "success" && hand_info_res.data.hand_number > 0) {
                this.hand_number = hand_info_res.data.hand_number;
                console.log("Initialized hand number from log:", this.hand_number);
            } else {
                console.log("No hand info in log yet, defaulting hand number to 1.");
            }
        } finally {
            logResponse(await this.puppeteer_service.closeLogPanel(), this.debug_mode);
        }
        await this.updateNumPlayers();
        while (this.active) {
            await this.waitForNextHand();
            await this.updateNumPlayers();
            await this.updateGameInfo();
            console.log("Number of players in game:", this.table.getNumPlayers());
            this.table.setPlayersInPot(this.table.getNumPlayers());
            await this.playOneHand(process_players_guard);
            this.hand_number++;
            this.first_created = "";
            this.table.nextHand();
        }
    }

    async openGame() {
        console.log(`The PokerNow game with id: ${this.game_id} will now open.`);
        
        logResponse(await this.puppeteer_service.navigateToGame(this.game_id), this.debug_mode);
        logResponse(await this.puppeteer_service.waitForGameInfo(), this.debug_mode);
    
        console.log("Getting game info.");
        const res = await this.puppeteer_service.getGameInfo();
        logResponse(res, this.debug_mode);
        if (res.code == "success") {
            const game_info = this.puppeteer_service.convertGameInfo(res.data as string);
            this.table = new Table(this.player_service);
            this.game = new Game(this.game_id, this.table, game_info.big_blind, game_info.small_blind, game_info.game_type, 30);
        } else {
            throw new Error ("Failed to get game info.");
        }
    }

    async enterTableInProgress(name: string, stack_size: number): Promise<void> {
        console.log(`Your player name will be ${name}.` )
        this.bot_name = name;
        this.ai_service.setBotName(name);
    
        console.log(`Your initial stack size will be ${stack_size}.`)
    
        await sleep(1000);
        console.log(`Attempting to enter table with name: ${name} and stack size: ${stack_size}.`);
        const res = await this.puppeteer_service.sendEnterTableRequest(name, stack_size);
    
        if (res.code === "success") {
            console.log("Waiting for table host to accept ingress request.");
            if (logResponse(await this.puppeteer_service.waitForTableEntry(), this.debug_mode) !== "success") {
                throw new Error("Table ingress request rejected, please try again.")
            }
        } else {
            throw res.error;
        }
    }

    private async updateNumPlayers() {
        const res = await this.puppeteer_service.getNumPlayers();
        if (res.code === "success") {
            this.table.setNumPlayers(Number(res.data));
        }
    }

    private async updateGameInfo() {
        logResponse(await this.puppeteer_service.waitForGameInfo(), this.debug_mode);
    
        console.log("Getting game info.");
        const res = await this.puppeteer_service.getGameInfo();
        logResponse(res, this.debug_mode);
        if (res.code == "success") {
            const game_info = this.puppeteer_service.convertGameInfo(res.data as string);
            this.game.updateGameTypeAndBlinds(game_info.small_blind, game_info.big_blind, game_info.game_type);
        } else {
            throw new Error ("Failed to get game info.");
        }
    }
    
    private async waitForNextHand() {
        console.log("Waiting for next hand to start.")
        await this.puppeteer_service.waitForNextHand(this.table.getNumPlayers(), this.game.getMaxTurnLength());
    }

    // pull logs
    // wait for any player action to start
    // check if it is the player's turn -> perform actions
    // check if there is a winner -> perform end of hand actions
    private async playOneHand(process_players_guard?: ProcessPlayersGuard) {
        let is_dealer = false;
        logResponse(await this.puppeteer_service.openLogPanel(), this.debug_mode);
        try {
            const hand_info_res = await this.puppeteer_service.getStartingHandInfo();
            if (hand_info_res.code === "success" && hand_info_res.data.hand_number > 0) {
                this.hand_number = hand_info_res.data.hand_number;
                let bot_id: string | undefined;
                try {
                    bot_id = this.table.getIdFromName(this.bot_name);
                } catch {
                    bot_id = undefined;
                }
                is_dealer = bot_id !== undefined && hand_info_res.data.dealer_id === bot_id;
                console.log(`Hand #${this.hand_number}, bot is dealer: ${is_dealer}`);
            }
        } finally {
            logResponse(await this.puppeteer_service.closeLogPanel(), this.debug_mode);
        }

        let processed_logs = {
            valid_msgs: new Array<Array<string>>,
            last_created: "",
            first_fetch: true
        }

        if (!is_dealer) {
            try {
                const init_log = await this.log_service.fetchData(this.hand_number, "");
                processed_logs = await this.processLogs(init_log, true);
            } catch (err) {
                console.log("Failed to pull initial hand logs:", err);
            }
        }

        while (true) {
            var res;
            console.log("Checking for bot's turn or winner of hand.");

            res = await this.puppeteer_service.waitForBotTurnOrWinner(this.table.getNumPlayers(), this.game.getMaxTurnLength());
            if (res.code == "success") {
                const data = res.data as string;
                if (data.includes("action-signal")) {
                    try {
                        await sleep(2000);
                        const log = await this.log_service.fetchData(this.hand_number, processed_logs.last_created);
                        const new_logs = await this.processLogs(log, processed_logs.first_fetch);
                        processed_logs = {
                            ...new_logs,
                            last_created: new_logs.last_created || processed_logs.last_created
                        };
                    } catch (err) {
                        console.log("Failed to pull logs:", err);
                    }
                    console.log("Performing bot's turn.");

                    try {
                        const pot_size = await this.getPotSize();
                        const hand = await this.getHand();
                        const stack_size = await this.getStackSize();

                        this.table.setPot(convertToBBs(pot_size, this.game.getBigBlind()));
                        await this.updateHero(hand, convertToBBs(stack_size, this.game.getBigBlind()));

                        await postProcessLogs(this.table.getLogsQueue(), this.game);
                        const query = constructQuery(this.game);

                        const bot_action = await this.queryBotAction(query, this.query_retries);
                        this.table.resetPlayerActions();
                        await this.performBotAction(bot_action);
                    } catch (err) {
                        console.log("Error during bot turn, falling back to default action:", err);
                        try {
                            const fallback = (await this.isValidBotAction(defaultCheckAction))
                                ? defaultCheckAction
                                : defaultFoldAction;
                            await this.performBotAction(fallback);
                        } catch (fallback_err) {
                            console.log("Failed to perform fallback action:", fallback_err);
                        }
                    }

                    console.log("Waiting for bot's turn to end");
                    logResponse(await this.puppeteer_service.waitForBotTurnEnd(), this.debug_mode);
                } else if (data.includes("winner")) {
                    console.log("Detected winner in hand.")
                    break;
                }
            }
        }

        res = await this.puppeteer_service.getStackSize();
        logResponse(res, this.debug_mode);
        if (res.code === "success") {
            console.log("Ending stack size:", res.data);
        }

        try {
            const log = await this.log_service.fetchData(this.hand_number, this.first_created);
            processed_logs = await this.processLogs(log, processed_logs.first_fetch);
            const should_process = process_players_guard
                ? await process_players_guard(this.first_created)
                : true;
            if (should_process) {
                await postProcessLogsAfterHand(processed_logs.valid_msgs, this.game);
                await this.table.processPlayers();
            }
        } catch (err) {
            console.log("Failed to process players:", err);
        }
        
        logResponse(await this.puppeteer_service.waitForHandEnd(), this.debug_mode);
        console.log("Completed a hand.\n");
    }

    private async processLogs<D, E=Error>(log: SuccessResponse<D> | ErrorResponse<E>, first_fetch: boolean): Promise<ProcessedLogs> {
        if (log.code === "success") {
            let data = this.log_service.getData(log);
            let msg = this.log_service.getMsg(data);
            if (first_fetch) {
                data = this.log_service.pruneLogsBeforeCurrentHand(data);
                msg = this.log_service.getMsg(data);
                this.table.setPlayerInitialStacksFromMsg(msg, this.game.getBigBlind());

                const handMsg = msg.find(m => m.includes("starting hand #"));
                if (handMsg) {
                    const match = handMsg.match(/starting hand #(\d+)/);
                    if (match) this.hand_number = parseInt(match[1]);
                }

                first_fetch = false;
                this.first_created = this.log_service.getLast(this.log_service.getCreatedAt(data));

                let stack_msg = getPlayerStacksMsg(msg);

                if (stack_msg) {
                    this.table.setIdToStack(getIdToInitialStackFromMsg(stack_msg, this.game.getBigBlind()));
                    this.table.setTableSeatToId(getTableSeatToIdFromMsg(stack_msg));
                    this.table.setIdToTableSeat(getIdToTableSeatFromMsg(stack_msg));
                    this.table.setIdToName(getIdToNameFromMsg(stack_msg));
                    this.table.setNameToId(getNameToIdFromMsg(stack_msg));
                    await this.table.updateCache();
                } else {
                    console.log("No Player stacks entry in fetched logs — preserving previous maps.");
                }
            }

            let only_valid = validateAllMsg(msg);
    
            preProcessLogs(only_valid, this.game);
            let first_seat_number = this.table.getSeatNumberFromId(this.table.getFirstSeatOrderId());
            this.table.setIdToPosition(first_seat_number);
            this.table.convertAllOrdersToPosition();

            return {
                valid_msgs: only_valid,
                last_created: this.log_service.getFirst(this.log_service.getCreatedAt(data)),
                first_fetch: first_fetch
            }
        } else {
            throw log.error;
        }
    }

    private async getPotSize(): Promise<number> {
        let pot_size: number = 0;
        const res = await this.puppeteer_service.getPotSize();
        logResponse(res, this.debug_mode);
        if (res.code === "success") {
            pot_size = res.data as number;
        }
        return pot_size;
    }

    private async getHand(): Promise<string[]> {
        let hand: string[] = [];
        const res = await this.puppeteer_service.getHand();
        logResponse(res, this.debug_mode);
        if (res.code === "success") {
            hand = res.data as string[];
        }
        return hand;
    }

    private async getStackSize(): Promise<number> {
        let stack_size: number = 0;
        const res = await this.puppeteer_service.getStackSize();
        logResponse(res, this.debug_mode);
        if (res.code === "success") {
            stack_size = res.data as number;
        }
        return stack_size;
    }

    private async updateHero(hand: string[], stack_size: number): Promise<void> {
        const hero = this.game.getHero();
        if (!hero) {
            this.game.createAndSetHero(this.table.getIdFromName(this.bot_name), hand, stack_size);
        } else {
            hero.setHand(hand);
            hero.setStackSize(stack_size);
        }
    }

    private async queryBotAction(query: string, retries: number, retry_counter: number = 0): Promise<BotAction> {
        if (retry_counter > retries) {
            if (await this.isValidBotAction(defaultCheckAction)) {
                console.log(`Failed to query bot action, exceeded the retry limit after ${retries} attempts. Defaulting to checking.`);
                return defaultCheckAction;
            } else {
                console.log(`Failed to query bot action, exceeded the retry limit after ${retries} attempts. Defaulting to folding.`);
                return defaultFoldAction;
            }
        }
        try {
            await sleep(2000);
            const bot_action = await this.ai_service.query(query);

            if (await this.isValidBotAction(bot_action)) {
                return bot_action;
            }
            console.log("Invalid bot action, retrying query.");
            return await this.queryBotAction(query, retries, retry_counter + 1);
        } catch (err) {
            console.log("Error while querying AI service:", err, "retrying query.");
            return await this.queryBotAction(query, retries, retry_counter + 1);
        }
    }

    private async isValidBotAction(bot_action: BotAction): Promise<boolean> {
        console.log("Attempted Bot Action:", bot_action);
        const valid_actions: string[] = ["bet", "raise", "call", "check", "fold", "all-in"];
        const curr_stack_size_in_BBs = this.game.getHero()!.getStackSize();
        console.log("Bot Stack in BBs:", curr_stack_size_in_BBs);
        let is_valid = false;
        if (bot_action.action_str && valid_actions.includes(bot_action.action_str)) {
            let res;
            switch (bot_action.action_str) {
                case "bet":
                    res = await this.puppeteer_service.waitForBetOption();
                    if (res.code === "success" && bot_action.bet_size_in_BBs > 0 && bot_action.bet_size_in_BBs <= curr_stack_size_in_BBs) {
                        is_valid = true;
                    }
                    break;
                case "raise":
                    //TODO: should also check that the raise >= min raise
                    res = await this.puppeteer_service.waitForBetOption();
                    if (res.code === "success" && bot_action.bet_size_in_BBs > 0 && bot_action.bet_size_in_BBs <= curr_stack_size_in_BBs) {
                        is_valid = true;
                    }
                    break;
                case "all-in":
                    res = await this.puppeteer_service.waitForBetOption();
                    if (res.code === "success") {
                        is_valid = true;
                    }
                    break;
                case "call":
                    res = await this.puppeteer_service.waitForCallOption();
                    if (res.code === "success" && bot_action.bet_size_in_BBs > 0 && bot_action.bet_size_in_BBs <= curr_stack_size_in_BBs) {
                        is_valid = true;
                    }
                    break;
                case "check":
                    res = await this.puppeteer_service.waitForCheckOption();
                    if (res.code === "success" && bot_action.bet_size_in_BBs == 0) {
                        is_valid = true;
                    }
                    break;
                case "fold":
                    res = await this.puppeteer_service.waitForFoldOption();
                    if (res.code === "success" && bot_action.bet_size_in_BBs == 0) {
                        is_valid = true;
                    }
                    break;
            }
        }
        return is_valid;
    }

    private async performBotAction(bot_action: BotAction): Promise<void> {
        console.log("Bot Action:", bot_action.action_str);
        let bet_size = convertToValue(bot_action.bet_size_in_BBs, this.game.getBigBlind());
        switch (bot_action.action_str) {
            case "bet":
                console.log("Bet Size:", convertToBBs(bet_size, this.game.getBigBlind()));
                logResponse(await this.puppeteer_service.betOrRaise(bet_size), this.debug_mode);
                break;
            case "raise":
                console.log("Bet Size:", convertToBBs(bet_size, this.game.getBigBlind()));
                logResponse(await this.puppeteer_service.betOrRaise(bet_size), this.debug_mode);
                break;
            case "all-in":
                bet_size = convertToValue(this.game.getHero()!.getStackSize(), this.game.getBigBlind());
                console.log("Bet Size:", convertToBBs(bet_size, this.game.getBigBlind()));
                logResponse(await this.puppeteer_service.betOrRaise(bet_size), this.debug_mode);
                break;
            case "call":
                logResponse(await this.puppeteer_service.call(), this.debug_mode);
                break;
            case "check":
                logResponse(await this.puppeteer_service.check(), this.debug_mode);
                break;
            case "fold":
                logResponse(await this.puppeteer_service.fold(), this.debug_mode);
                const res = await this.puppeteer_service.cancelUnnecessaryFold();
                if (res.code === "success") {
                    logResponse(await this.puppeteer_service.check(), this.debug_mode);
                }
                break;
        }
    }
}