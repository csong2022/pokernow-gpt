import { Game } from '../game/game.model.ts';
import { constructHandSetup, constructTurnUpdate } from './query-construction.helper.ts';

import { AIService, BotAction, defaultCheckAction, defaultFoldAction } from '../ai/ai-client.interface.ts';
import { ActionAvailability } from './action-availability.interface.ts';
import type { HandContextBuilder } from './hand-context-builder.interface.ts';

import { sleep, TimeoutError } from '../../utils/bot-timeout.helper.ts';
import { Logger } from '../../utils/logger.util.ts';

import { HandState } from '../game/hand-state.ts';

export class DecisionEngine {
    constructor(
        private ai: AIService,
        private availability: ActionAvailability,
        private contextBuilder: HandContextBuilder,
        private state: HandState,
        private logger: Logger,
        private query_retries: number,
        // Pause before each query. Live keeps human-like pacing (avoids PokerNow
        // flagging instant actions); the arena has no table, so it passes 0.
        private query_delay_ms: number = 2000,
    ) {}

    async decide(game: Game): Promise<BotAction> {
        try {
            const query = this.state.is_first_turn_of_hand
                ? constructHandSetup(game, this.contextBuilder) + "\n\n" + constructTurnUpdate(game)
                : constructTurnUpdate(game);
            this.state.is_first_turn_of_hand = false;

            return await this.queryWithRetries(query, this.query_retries);
        } catch (err) {
            this.logger.error("Error during decision, falling back to default action:", err);
            return await this.fallback();
        }
    }

    private async queryWithRetries(query: string, retries: number, retry_counter: number = 0): Promise<BotAction> {
        if (retry_counter > retries) {
            const fallback = await this.fallback();
            this.logger.error(`Failed to query bot action, exceeded the retry limit after ${retries} attempts. Defaulting to ${fallback.action_str}.`);
            return fallback;
        }
        try {
            if (this.query_delay_ms > 0) await sleep(this.query_delay_ms);
            const action = await this.ai.query(query);
            if (await this.isValidBotAction(action)) {
                return action;
            }
            this.logger.warn("Invalid bot action, retrying query.");
            return await this.queryWithRetries(query, retries, retry_counter + 1);
        } catch (err) {
            if (err instanceof TimeoutError) {
                this.logger.warn("AI query timed out, defaulting to safe action.");
                return await this.fallback();
            }
            this.logger.error("Error while querying AI service:", err, "retrying query.");
            return await this.queryWithRetries(query, retries, retry_counter + 1);
        }
    }

    private async fallback(): Promise<BotAction> {
        if (!this.state.game.getHero()) {
            return defaultFoldAction;
        }
        return (await this.isValidBotAction(defaultCheckAction)) ? defaultCheckAction : defaultFoldAction;
    }

    private async isValidBotAction(bot_action: BotAction): Promise<boolean> {
        this.logger.info("Attempted Bot Action:", bot_action);
        const valid_actions: string[] = ["bet", "raise", "call", "check", "fold", "all-in"];
        const hero = this.state.game.getHero();
        if (!hero) return false;
        const curr_stack_size_in_BBs = hero.getStackSize();
        this.logger.info("Bot Stack in BBs:", curr_stack_size_in_BBs);

        if (!bot_action.action_str || !valid_actions.includes(bot_action.action_str)) return false;

        switch (bot_action.action_str) {
            case "bet":
            case "raise":
                //TODO: should also check that the raise >= min raise
                return (
                    (await this.availability.canBet()) &&
                    bot_action.bet_size_in_BBs > 0 &&
                    bot_action.bet_size_in_BBs <= curr_stack_size_in_BBs
                );
            case "all-in":
                return await this.availability.canBet();
            case "call":
                // The call amount can exceed the bot's stack when facing a larger bet —
                // PokerNow caps the call at the bot's remaining chips (effectively all-in).
                return (await this.availability.canCall()) && bot_action.bet_size_in_BBs > 0;
            case "check":
                return (await this.availability.canCheck()) && bot_action.bet_size_in_BBs == 0;
            case "fold":
                return (await this.availability.canFold()) && bot_action.bet_size_in_BBs == 0;
        }
        return false;
    }
}
