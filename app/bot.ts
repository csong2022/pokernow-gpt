import prompt from 'prompt-sync';
import { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";

import { sleep } from './helpers/bot-helper.ts';

import { Game } from './models/game.ts';
import { Table } from './models/table.ts';

import { LogService } from './services/log-service.ts';
import { BotAction, OpenAIService } from './services/openai-service.ts'
import { PlayerService } from './services/player-service.ts';
import { PuppeteerService } from './services/puppeteer-service.ts';

import { parseResponse } from './helpers/ai-query-helper.ts'
import { constructQuery } from './helpers/construct-query-helper.ts';

import { DebugMode, logResponse } from './utils/error-handling-utils.ts';
import { type ProcessedLogs } from './utils/log-processing-utils.ts';
import { getIdToTableSeatFromMsg, getNameToIdFromMsg, getIdToInitialStackFromMsg, getPlayerStacksMsg, getTableSeatToIdFromMsg, validateAllMsg } from './utils/message-processing-utils.ts';
import { convertToBBs, convertToValue } from './utils/value-conversion-utils.ts'

export class Bot {
    private log_service: LogService;
    private openai_service: OpenAIService;
    private player_service: PlayerService;
    private puppeteer_service: PuppeteerService;

    private game_id: string;
    private debug_mode: DebugMode;
    private query_retries: number;

    private first_created: string;
    private hand_history: ChatCompletionMessageParam | any;

    private table!: Table;
    private game!: Game;
    private bot_name!: string;

    constructor(log_service: LogService, 
                openai_service: OpenAIService,
                player_service: PlayerService,
                puppeteer_service: PuppeteerService,
                game_id: string,
                debug_mode: DebugMode,
                query_retries: number) 
    {
        this.log_service = log_service;
        this.openai_service = openai_service;
        this.player_service = player_service;
        this.puppeteer_service = puppeteer_service;

        this.game_id = game_id;
        this.debug_mode = debug_mode;
        this.query_retries = query_retries;

        this.first_created = "";
        this.hand_history = [];
    }

    public async run() {
        await this.openGame();
        await this.enterTableInProgress();
        // retrieve initial num players
        await this.updateNumPlayers();
        //TODO: implement loop until STOP SIGNAL (perhaps from UI?)
        while (true) {
            await this.waitForNextHand();
            await this.updateNumPlayers();
            console.log("Number of players in game:", this.table.getNumPlayers());
            this.table.setPlayersInPot(this.table.getNumPlayers());
            await this.playOneHand();
            this.hand_history = [];
            this.table.nextHand();
        }
    }

    private async openGame() {
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

    private async enterTableInProgress() {
        const io = prompt();
        while (true) {
            const name = io("What is your desired player name? ");
            console.log(`Your player name will be ${name}.` )
            this.bot_name = name;
    
            const stack_size = io("What is your desired stack size? ");
            console.log(`Your initial stack size will be ${stack_size}.`)
    
            console.log(`Attempting to enter table with name: ${name} and stack size: ${stack_size}.`);
            const code = logResponse(await this.puppeteer_service.sendEnterTableRequest(name, Number(stack_size)), this.debug_mode);
    
            if (code === "success") {
                break;
            }
            console.log("Please try again.");
        }
        console.log("Waiting for table host to accept ingress request.");
        logResponse(await this.puppeteer_service.waitForTableEntry(), this.debug_mode);
    }

    private async updateNumPlayers() {
        const res = await this.puppeteer_service.getNumPlayers();
        if (res.code === "success") {
            this.table.setNumPlayers(Number(res.data));
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
    private async playOneHand() {
        let processed_logs = {
            valid_msgs: new Array<Array<string>>,
            last_created: this.first_created,
            first_fetch: true
        }
        while (true) {
            var res;
            // wait for the bot's turn -> perform actions
            // OR winner is detected -> pull all the logs
            console.log("Checking for bot's turn or winner of hand.");

            res = await this.puppeteer_service.waitForBotTurnOrWinner(this.table.getNumPlayers(), this.game.getMaxTurnLength());

            if (res.code == "success") {
                const data = res.data as string;
                if (data.includes("action-signal")) {
                    try {
                        processed_logs = await this.pullAndProcessLogs(processed_logs.last_created, processed_logs.first_fetch);
                    } catch (err) {
                        console.log("Failed to pull logs.");
                    }
                    console.log("Performing bot's turn.");

                    // get hand and stack size
                    const hand = await this.getHand();
                    const stack_size = await this.getStackSize();

                    await this.updateHero(hand, convertToBBs(stack_size, this.game.getBigBlind()));

                    // post process logs and construct query
                    await this.table.postProcessLogs(this.table.getLogsQueue(), this.game);
                    const query = constructQuery(this.game);

                    // query chatGPT and make action
                    try {
                        const bot_action = await this.queryBotAction(query, this.query_retries);
                        await this.performBotAction(bot_action);
                    } catch (err) {
                        console.log("Failed to query and perform bot action.")
                    }

                    console.log("Waiting for bot's turn to end");
                    logResponse(await this.puppeteer_service.waitForBotTurnEnd(), this.debug_mode);
                } else if (data.includes("winner")) {
                    console.log("Detected winner in hand.")
                    break;
                }
            }
        }

        try {
            processed_logs = await this.pullAndProcessLogs(this.first_created, processed_logs.first_fetch);
            await this.table.postProcessLogsAfterHand(processed_logs.valid_msgs);
            await this.table.processPlayers();
        } catch (err) {
            console.log("Failed to process players.");
        }
        
        logResponse(await this.puppeteer_service.waitForHandEnd(), this.debug_mode);
        console.log("Completed a hand.");
    }

    private async pullAndProcessLogs(last_created: string, first_fetch: boolean): Promise<ProcessedLogs> {
        const log = await this.log_service.fetchData("", last_created);
        if (log.code === "success") {
            let data = this.log_service.getData(log);
            let msg = this.log_service.getMsg(data);
            if (first_fetch) {
                data = this.log_service.pruneLogsBeforeCurrentHand(data);
                msg = this.log_service.getMsg(data);
                this.table.setPlayerInitialStacksFromMsg(msg, this.game.getBigBlind());

                first_fetch = false;
                this.first_created = this.log_service.getLast(this.log_service.getCreatedAt(data));

                let stack_msg = getPlayerStacksMsg(msg);

                let id_to_stack_map = getIdToInitialStackFromMsg(stack_msg, this.game.getBigBlind());
                this.table.setIdToStack(id_to_stack_map);

                let seat_to_id_map = getTableSeatToIdFromMsg(stack_msg);
                this.table.setTableSeatToId(seat_to_id_map);

                let id_to_seat_map = getIdToTableSeatFromMsg(stack_msg);
                this.table.setIdToTableSeat(id_to_seat_map);
                
                let name_to_id_map = getNameToIdFromMsg(stack_msg);
                this.table.setNameToId(name_to_id_map);

                await this.table.updateCache();
            }

            let only_valid = validateAllMsg(msg);
    
            this.table.preProcessLogs(only_valid, this.game.getSmallBlind());
            let first_seat_number = this.table.getIdToSeatNumber()!.get(this.table.getFirstSeatOrderId())!;
            this.table.setIdToPosition(first_seat_number)
            this.table.convertAllOrdersToPosition();

            last_created = this.log_service.getFirst(this.log_service.getCreatedAt(data));
            return {
                valid_msgs: only_valid,
                last_created: last_created,
                first_fetch: first_fetch
            }
        } else {
            throw new Error("Failed to pull logs.");
        }
    }

    private async getHand(): Promise<string[]> {
        var hand: string[] = [];
        const res = await this.puppeteer_service.getHand();
        logResponse(res, this.debug_mode);
        if (res.code === "success") {
            hand = res.data as string[];
        }
        return hand;
    }

    private async getStackSize(): Promise<number> {
        var stack_size: number = 0;
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
            this.game.createAndSetHero(this.bot_name, hand, stack_size);
        } else {
            hero.setHand(hand);
            hero.setStackSize(stack_size);
        }
    }

    private async queryBotAction(query: string, retries: number, retry_counter: number = 0): Promise<BotAction> {
        if (retry_counter > retries) {
            const res = await this.puppeteer_service.check();
            if (res.code === "success") {
                console.log(`Failed to query bot action, exceeded the retry limit after ${retries} attempts. Defaulted to checking.`);
            } else {
                await this.puppeteer_service.fold();
                console.log(`Failed to query bot action, exceeded the retry limit after ${retries} attempts. Defaulted to folding.`);
            }
        }
        try {
            await sleep(2000);
            const GPTResponse = await this.openai_service.queryGPT(query, this.hand_history);
            this.hand_history = GPTResponse.prevMessages;
            const choices = GPTResponse.choices;
            this.hand_history.push(choices.message);
            this.table.resetPlayerActions();
            let bot_action: BotAction = {
                action_str: "",
                bet_size_in_BBs: 0
            };

            if (choices && choices.message.content) {
                bot_action = parseResponse(choices.message.content);
            } else {
                console.log("Empty ChatGPT response, retrying query.");
                return await this.queryBotAction(query, retries, retry_counter + 1);
            }

            if (await this.isValidBotAction(bot_action)) {
                return bot_action;
            }
            console.log("Invalid bot action, retrying query.");
            return await this.queryBotAction(query, retries, retry_counter + 1);
        } catch (err) {
            console.log("Error while querying ChatGPT:", err, "retrying query.");
            return await this.queryBotAction(query, retries, retry_counter + 1);
        }
    }

    private async isValidBotAction(bot_action: BotAction): Promise<boolean> {
        console.log("Attempted Bot Action:", bot_action);
        const valid_actions: string[] = ["bet", "raise", "call", "check", "fold"];
        const curr_stack_size_in_BBs = this.game.getHero()!.getStackSize();
        console.log("Bot Stack in BBs:", curr_stack_size_in_BBs);
        let is_valid = false;
        if (bot_action.action_str && valid_actions.includes(bot_action.action_str)) {
            let res;
            switch (bot_action.action_str) {
                case "bet":
                    res = await this.puppeteer_service.waitForBetOption();
                    if (res.code === "success") {
                        is_valid = true;
                    }
                    if (bot_action.bet_size_in_BBs > 0 && bot_action.bet_size_in_BBs <= curr_stack_size_in_BBs) {
                        is_valid = true;
                    }
                    break;
                case "raise":
                    //TODO: should also check that the raise >= min raise
                    res = await this.puppeteer_service.waitForBetOption();
                    if (res.code === "success") {
                        is_valid = true;
                    }
                    if (bot_action.bet_size_in_BBs > 0 && bot_action.bet_size_in_BBs <= curr_stack_size_in_BBs) {
                        is_valid = true;
                    }
                    break;
                case "call":
                    res = await this.puppeteer_service.waitForCallOption();
                    if (res.code === "success") {
                        is_valid = true;
                    }
                    if (bot_action.bet_size_in_BBs > 0 && bot_action.bet_size_in_BBs <= curr_stack_size_in_BBs) {
                        is_valid = true;
                    }
                    break;
                case "check":
                    res = await this.puppeteer_service.waitForCheckOption();
                    if (res.code === "success") {
                        is_valid = true;
                    }
                    if (bot_action.bet_size_in_BBs == 0) {
                        is_valid = true;
                    }
                    break;
                case "fold":
                    if (bot_action.bet_size_in_BBs == 0) {
                        is_valid = true;
                    }
                    break;
            }
        }
        return is_valid;
    }

    private async performBotAction(bot_action: BotAction): Promise<void> {
        console.log("Bot Action:", bot_action.action_str);
        const bet_size = convertToValue(bot_action.bet_size_in_BBs, this.game.getBigBlind());
        console.log("Bet Size:", convertToBBs(bet_size, this.game.getBigBlind()));
        switch (bot_action.action_str) {
            case "bet":
                logResponse(await this.puppeteer_service.betOrRaise(bet_size), this.debug_mode);
                break;
            case "raise":
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