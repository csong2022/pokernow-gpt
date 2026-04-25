import { Game } from '../core/game/game.model.ts';
import { ProcessedLogs } from '../core/poker/log-processing.interface.ts';
import { postProcessLogs, postProcessLogsAfterHand, preProcessLogs } from '../core/poker/log-processing.util.ts';
import {
    getIdToInitialStackFromMsg,
    getIdToNameFromMsg,
    getIdToTableSeatFromMsg,
    getNameToIdFromMsg,
    getPlayerStacksMsg,
    getTableSeatToIdFromMsg,
    validateAllMsg,
} from '../core/poker/message-processing.util.ts';
import { convertToBBs } from '../core/poker/value-conversion.util.ts';

import { AIService } from '../services/ai/ai-client.interface.ts';
import { LogService } from '../services/logs/log.service.ts';
import { PuppeteerService } from '../services/puppeteer/puppeteer.service.ts';

import { sleep } from '../utils/bot-timeout.helper.ts';
import { DebugMode, ErrorResponse, logResponse, SuccessResponse } from '../utils/error-handling.util.ts';

import { HandState } from './hand-state.ts';

export type ProcessPlayersGuard = (first_created: string) => Promise<boolean>;

export class GameStateBuilder {
    constructor(
        private puppeteer: PuppeteerService,
        private logs: LogService,
        private ai: AIService,
        private state: HandState,
        private debug: DebugMode,
        private guard?: ProcessPlayersGuard,
    ) {}

    async build(): Promise<Game | null> {
        if (this.state.between_hands) {
            await this.startNewHand();
            this.state.between_hands = false;
        }

        console.log("Checking for bot's turn or winner of hand.");
        const res = await this.puppeteer.waitForBotTurnOrWinner(
            this.state.table.getNumPlayers(),
            this.state.game.getMaxTurnLength(),
        );
        if (res.code !== "success") {
            return null;
        }

        const data = res.data as string;
        if (data.includes("winner")) {
            console.log("Detected winner in hand.");
            await this.endHand();
            this.state.between_hands = true;
            return null;
        }

        if (!data.includes("action-signal")) {
            return null;
        }

        await this.fetchActionLogs();
        console.log("Performing bot's turn.");
        const ready = await this.prepareHero();
        if (!ready) {
            console.log("Hero state not ready; skipping turn and waiting for it to time out.");
            return null;
        }
        await postProcessLogs(this.state.table.getLogsQueue(), this.state.game);
        return this.state.game;
    }

    private async startNewHand(): Promise<void> {
        await this.waitForNextHand();
        await this.updateNumPlayers();
        await this.updateGameInfo();
        console.log("Number of players in game:", this.state.table.getNumPlayers());
        this.state.table.setPlayersInPot(this.state.table.getNumPlayers());

        this.ai.resetHand();
        this.state.is_first_turn_of_hand = true;
        this.state.is_dealer = false;
        this.state.processed_logs = { valid_msgs: [], last_created: "", first_fetch: true };

        logResponse(await this.puppeteer.openLogPanel(), this.debug);
        try {
            const hand_info_res = await this.puppeteer.getStartingHandInfo();
            if (hand_info_res.code === "success" && hand_info_res.data.hand_number > 0) {
                this.state.hand_number = hand_info_res.data.hand_number;
                let bot_id: string | undefined;
                try {
                    bot_id = this.state.table.getIdFromName(this.state.bot_name);
                } catch {
                    bot_id = undefined;
                }
                this.state.is_dealer = bot_id !== undefined && hand_info_res.data.dealer_id === bot_id;
                console.log(`Hand #${this.state.hand_number}, bot is dealer: ${this.state.is_dealer}`);
            }
        } finally {
            logResponse(await this.puppeteer.closeLogPanel(), this.debug);
        }

        if (!this.state.is_dealer) {
            try {
                let init_log = await this.logs.fetchData(this.state.hand_number, "");
                this.state.processed_logs = await this.processLogs(init_log, true);

                if (!this.state.table.getNameToId().has(this.state.bot_name)) {
                    const retry_hand = this.state.hand_number + 1;
                    console.log(
                        `Bot "${this.state.bot_name}" not in Player stacks for hand ${this.state.hand_number}; retrying with hand ${retry_hand}.`,
                    );
                    this.state.hand_number = retry_hand;
                    init_log = await this.logs.fetchData(this.state.hand_number, "");
                    this.state.processed_logs = await this.processLogs(init_log, true);
                }
            } catch (err) {
                console.log("Failed to pull initial hand logs:", err);
            }
        }
    }

    private async waitForNextHand(): Promise<void> {
        console.log("Waiting for next hand to start.");
        await this.puppeteer.waitForNextHand(
            this.state.table.getNumPlayers(),
            this.state.game.getMaxTurnLength(),
        );
    }

    private async updateNumPlayers(): Promise<void> {
        const res = await this.puppeteer.getNumPlayers();
        if (res.code === "success") {
            this.state.table.setNumPlayers(Number(res.data));
        }
    }

    private async updateGameInfo(): Promise<void> {
        logResponse(await this.puppeteer.waitForGameInfo(), this.debug);
        console.log("Getting game info.");
        const res = await this.puppeteer.getGameInfo();
        logResponse(res, this.debug);
        if (res.code !== "success") {
            throw new Error("Failed to get game info.");
        }
        const game_info = this.puppeteer.convertGameInfo(res.data as string);
        this.state.game.updateGameTypeAndBlinds(game_info.small_blind, game_info.big_blind, game_info.game_type);
    }

    private async fetchActionLogs(): Promise<void> {
        try {
            await sleep(2000);
            const was_first_fetch = this.state.processed_logs.first_fetch;
            let log = await this.logs.fetchData(this.state.hand_number, this.state.processed_logs.last_created);
            let new_logs = await this.processLogs(log, was_first_fetch);

            if (was_first_fetch && !this.state.table.getNameToId().has(this.state.bot_name)) {
                const retry_hand = this.state.hand_number + 1;
                console.log(
                    `Bot "${this.state.bot_name}" not in Player stacks for hand ${this.state.hand_number}; retrying with hand ${retry_hand}.`,
                );
                this.state.hand_number = retry_hand;
                log = await this.logs.fetchData(this.state.hand_number, "");
                new_logs = await this.processLogs(log, true);
            }

            this.state.processed_logs = {
                ...new_logs,
                last_created: new_logs.last_created || this.state.processed_logs.last_created,
            };
        } catch (err) {
            console.log("Failed to pull logs:", err);
        }
    }

    private async prepareHero(): Promise<boolean> {
        try {
            const pot_size = await this.readPotSize();
            const hand = await this.readHand();
            const stack_size = await this.readStackSize();

            this.state.table.setPot(convertToBBs(pot_size, this.state.game.getBigBlind()));
            return await this.updateHero(hand, convertToBBs(stack_size, this.state.game.getBigBlind()));
        } catch (err) {
            console.log("Error preparing hero:", err);
            return false;
        }
    }

    private async readPotSize(): Promise<number> {
        const res = await this.puppeteer.getPotSize();
        logResponse(res, this.debug);
        return res.code === "success" ? (res.data as number) : 0;
    }

    private async readHand(): Promise<string[]> {
        const res = await this.puppeteer.getHand();
        logResponse(res, this.debug);
        return res.code === "success" ? (res.data as string[]) : [];
    }

    private async readStackSize(): Promise<number> {
        const res = await this.puppeteer.getStackSize();
        logResponse(res, this.debug);
        return res.code === "success" ? (res.data as number) : 0;
    }

    private async updateHero(hand: string[], stack_size: number): Promise<boolean> {
        const hero = this.state.game.getHero();
        if (!hero) {
            let bot_id: string;
            try {
                bot_id = this.state.table.getIdFromName(this.state.bot_name);
            } catch {
                console.log(
                    `Cannot create hero — bot name "${this.state.bot_name}" not in name_to_id map. Known mappings:`,
                    Array.from(this.state.table.getNameToId().entries()),
                );
                return false;
            }
            this.state.game.createAndSetHero(bot_id, hand, stack_size);
        } else {
            hero.setHand(hand);
            hero.setStackSize(stack_size);
        }
        return true;
    }

    private async endHand(): Promise<void> {
        const stack_res = await this.puppeteer.getStackSize();
        logResponse(stack_res, this.debug);
        if (stack_res.code === "success") {
            console.log("Ending stack size:", stack_res.data);
            if (Number(stack_res.data) === 0) {
                console.log(`Bot "${this.state.bot_name}" has busted — stopping after this hand.`);
                this.state.active = false;
            }
        }

        try {
            const should_process = this.guard ? await this.guard(this.state.first_created) : true;
            if (should_process) {
                const log = await this.logs.fetchData(this.state.hand_number, this.state.first_created);
                const processed = await this.processLogs(log, this.state.processed_logs.first_fetch);
                await postProcessLogsAfterHand(processed.valid_msgs, this.state.game);
                await this.state.table.processPlayers();
            }
        } catch (err) {
            console.log("Failed to process players:", err);
        }

        logResponse(await this.puppeteer.waitForHandEnd(), this.debug);
        console.log("Completed a hand.\n");

        this.state.hand_number++;
        this.state.first_created = "";
        this.state.table.nextHand();
    }

    private async processLogs<D, E = Error>(
        log: SuccessResponse<D> | ErrorResponse<E>,
        first_fetch: boolean,
    ): Promise<ProcessedLogs> {
        if (log.code !== "success") {
            throw log.error;
        }
        let data = this.logs.getData(log);
        let msg = this.logs.getMsg(data);
        if (first_fetch) {
            data = this.logs.pruneLogsBeforeCurrentHand(data);
            msg = this.logs.getMsg(data);
            this.state.table.setPlayerInitialStacksFromMsg(msg, this.state.game.getBigBlind());

            const handMsg = msg.find(m => m.includes("starting hand #"));
            if (handMsg) {
                const match = handMsg.match(/starting hand #(\d+)/);
                if (match) this.state.hand_number = parseInt(match[1]);
            }

            first_fetch = false;
            this.state.first_created = this.logs.getLast(this.logs.getCreatedAt(data));

            const stack_msg = getPlayerStacksMsg(msg);
            if (stack_msg) {
                this.state.table.setIdToStack(getIdToInitialStackFromMsg(stack_msg, this.state.game.getBigBlind()));
                this.state.table.setTableSeatToId(getTableSeatToIdFromMsg(stack_msg));
                this.state.table.setIdToTableSeat(getIdToTableSeatFromMsg(stack_msg));
                this.state.table.setIdToName(getIdToNameFromMsg(stack_msg));
                this.state.table.setNameToId(getNameToIdFromMsg(stack_msg));
                await this.state.table.updateCache();
            } else {
                console.log("No Player stacks entry in fetched logs — preserving previous maps.");
            }
        }

        const only_valid = validateAllMsg(msg);
        preProcessLogs(only_valid, this.state.game);
        const first_seat_number = this.state.table.getSeatNumberFromId(this.state.table.getFirstSeatOrderId());
        this.state.table.setIdToPosition(first_seat_number);
        this.state.table.convertAllOrdersToPosition();

        return {
            valid_msgs: only_valid,
            last_created: this.logs.getFirst(this.logs.getCreatedAt(data)),
            first_fetch,
        };
    }
}
