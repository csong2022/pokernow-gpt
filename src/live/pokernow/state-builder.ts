import { Game } from '../../core/game/game.model.ts';
import { ProcessedLogs } from '../../core/poker/log-processing.interface.ts';
import { postProcessLogs, postProcessLogsAfterHand, preProcessLogs } from './log-processing.util.ts';
import {
    getIdToInitialStackFromMsg,
    getIdToNameFromMsg,
    getIdToTableSeatFromMsg,
    getNameToIdFromMsg,
    getPlayerStacksMsg,
    getTableSeatToIdFromMsg,
    validateAllMsg,
} from './message-processing.util.ts';
import { convertToBBs } from '../../core/poker/value-conversion.util.ts';

import { AIService } from '../../core/ai/ai-client.interface.ts';
import { HandOutcomesAPIService } from '../../services/db/handoutcomes.service.ts';
import { LogService } from './log.service.ts';
import { PuppeteerService } from './puppeteer.service.ts';

import { sleep } from '../../utils/bot-timeout.helper.ts';
import { DebugMode, ErrorResponse, logResponse, SuccessResponse } from '../../utils/error-handling.util.ts';
import { Logger } from '../../utils/logger.util.ts';

import { HandState } from '../../bot/hand-state.ts';

export type ProcessPlayersGuard = (first_created: string) => Promise<boolean>;

export class GameStateBuilder {
    constructor(
        private puppeteer: PuppeteerService,
        private logs: LogService,
        private ai: AIService,
        private hand_outcomes: HandOutcomesAPIService,
        private state: HandState,
        private logger: Logger,
        private debug: DebugMode,
        private guard?: ProcessPlayersGuard,
    ) {}

    async build(): Promise<Game | null> {
        if (this.state.between_hands) {
            const started = await this.startNewHand();
            if (!started) {
                this.logger.info("No new hand detected (likely alone at table). Sleeping before retry.");
                await sleep(5000);
                return null;
            }
            this.state.between_hands = false;
        }

        this.logger.info("Checking for bot's turn or winner of hand.");
        const res = await this.puppeteer.waitForBotTurnOrWinner(
            this.state.table.getNumPlayers(),
            this.state.game.getMaxTurnLength(),
        );
        if (res.code !== "success") {
            return null;
        }

        const data = res.data as string;
        if (data.includes("winner")) {
            this.logger.info("Detected winner in hand.");
            await this.endHand();
            this.state.between_hands = true;
            return null;
        }

        if (!data.includes("action-signal")) {
            return null;
        }

        await this.fetchActionLogs();
        this.logger.info("Performing bot's turn.");
        const ready = await this.prepareHero();
        if (!ready) {
            this.logger.warn("Hero state not ready; skipping turn and waiting for it to time out.");
            return null;
        }
        await postProcessLogs(this.state.table.getLogsQueue(), this.state.game);
        return this.state.game;
    }

    private async startNewHand(): Promise<boolean> {
        await this.waitForNextHand();
        await this.updateNumPlayers();
        await this.updateGameInfo();
        this.logger.info("Number of players in game:", this.state.table.getNumPlayers());
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
                this.logger.info(`Hand #${this.state.hand_number}, bot is dealer: ${this.state.is_dealer}`);
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
                    this.logger.warn(
                        `Bot "${this.state.bot_name}" not in Player stacks for hand ${this.state.hand_number}; retrying with hand ${retry_hand}.`,
                    );
                    this.state.hand_number = retry_hand;
                    init_log = await this.logs.fetchData(this.state.hand_number, "");
                    this.state.processed_logs = await this.processLogs(init_log, true);
                }

                // If the API returned no log entries for this hand, the new hand hasn't
                // started yet (e.g., alone at the table waiting for an opponent).
                if (this.state.processed_logs.valid_msgs.length === 0) {
                    return false;
                }
            } catch (err) {
                this.logger.error("Failed to pull initial hand logs:", err);
                return false;
            }
        }
        return true;
    }

    private async waitForNextHand(): Promise<void> {
        this.logger.info("Waiting for next hand to start.");
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
        this.logger.info("Getting game info.");
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
                this.logger.warn(
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
            this.logger.error("Failed to pull logs:", err);
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
            this.logger.error("Error preparing hero:", err);
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
                this.logger.error(
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
        let ending_stack_BB = 0;
        if (stack_res.code === "success") {
            this.logger.info("Ending stack size:", stack_res.data);
            ending_stack_BB = convertToBBs(Number(stack_res.data), this.state.game.getBigBlind());
            if (Number(stack_res.data) === 0) {
                this.logger.info(`Bot "${this.state.bot_name}" has busted — stopping after this hand.`);
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
            this.logger.error("Failed to process players:", err);
        }

        await this.recordHandOutcome(ending_stack_BB);

        logResponse(await this.puppeteer.waitForHandEnd(), this.debug);
        this.logger.info("Completed a hand.\n");

        this.state.hand_number++;
        this.state.first_created = "";
        this.state.table.nextHand();
    }

    private async recordHandOutcome(ending_stack_BB: number): Promise<void> {
        let bot_id: string;
        let starting_stack_BB: number;
        try {
            bot_id = this.state.table.getIdFromName(this.state.bot_name);
            starting_stack_BB = this.state.table.getPlayerInitialStackFromId(bot_id);
        } catch {
            // Bot wasn't seated this hand (joined late, log parse failure, etc.).
            return;
        }

        let position: string | null = null;
        try {
            position = this.state.table.getPlayerPositionFromId(bot_id);
        } catch {
            // Position not yet known — leave null.
        }

        try {
            await this.hand_outcomes.insert({
                hand_id: `${this.state.game_id}:${this.state.hand_number}`,
                bot_uuid: this.state.bot_uuid,
                bot_name: this.state.bot_name,
                model_provider: this.state.model_provider,
                model_name: this.state.model_name,
                starting_stack_BB,
                ending_stack_BB,
                stack_delta_BB: ending_stack_BB - starting_stack_BB,
                position,
                saw_showdown: 0,
                created_at: Date.now(),
            });
        } catch (err) {
            this.logger.error("Failed to record hand outcome:", err);
        }
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
            this.state.table.setIdToStack(getIdToInitialStackFromMsg(getPlayerStacksMsg(msg), this.state.game.getBigBlind()));

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
                this.logger.warn("No Player stacks entry in fetched logs — preserving previous maps.");
            }
        }

        // API returns logs newest-first; flip once here so all downstream code works
        // with chronological order.
        const chronological_logs = validateAllMsg(msg).reverse();
        preProcessLogs(chronological_logs, this.state.game);
        const first_seat_number = this.state.table.getSeatNumberFromId(this.state.table.getFirstSeatOrderId());
        this.state.table.setIdToPosition(first_seat_number);
        this.state.table.convertAllOrdersToPosition();

        return {
            valid_msgs: chronological_logs,
            last_created: this.logs.getFirst(this.logs.getCreatedAt(data)),
            first_fetch,
        };
    }
}
