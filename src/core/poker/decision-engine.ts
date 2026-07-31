import { Game } from '../game/game.model.ts';
import { constructHandSetup, constructTurnUpdate, RETHINK_PROMPT } from './query-construction.helper.ts';

// Decision-engine events worth tracking as quality signals (distinct from arena's
// action-clamp "malformed" events): a rethink reprompt was needed, or we gave up
// and defaulted. Emitted via the injected sink so the arena can log them per hand.
export type DecisionEvent = 'rethink' | 'fallback';

// Full record-only trace of one decision, for replay/audit. raw_response is the
// model's reasoning + final-answer text; it is never read back into game state or
// the stat passes (record-only).
export interface DecisionTrace {
    prompt: string;
    raw_response: string;
    parsed_action: { action: string; amount: number };
    events: DecisionEvent[];
}

import { AIService } from '../ai/ai-client.interface.ts';
import { BotAction } from './bot-action.ts';
import { ActionAvailability } from './action-availability.interface.ts';
import type { HandContextBuilder } from './hand-context-builder.interface.ts';

import { sleep, TimeoutError } from '../../utils/bot-timeout.helper.ts';
import { Logger } from '../../utils/logger.util.ts';

import { HandState } from '../game/hand-state.ts';

// Safety net for when the model can't produce a legal action: check if that's
// legal here, otherwise fold. This is poker policy, not an AI-client concern, so
// it lives with the engine that applies it (its only consumer) rather than on the
// provider port.
//
// Typed so a typo in action_str is a compile error rather than a silent fold at
// the table, and frozen because fallback() hands these objects themselves to
// callers in live/arena — one stray mutation would corrupt every later fallback
// in the process.
const defaultCheckAction: BotAction = Object.freeze({ action_str: "check", bet_size_in_BBs: 0 });
const defaultFoldAction: BotAction = Object.freeze({ action_str: "fold", bet_size_in_BBs: 0 });

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
        // Optional sink for rethink/fallback events (arena wires it into the JSONL).
        private onEvent?: (event: DecisionEvent) => void,
        // Optional per-decision trace sink (arena writes it into the replayable log).
        private onDecision?: (trace: DecisionTrace) => void,
    ) {}

    // Events accumulated for the decision currently being made (also forwarded to
    // onEvent), so the per-decision trace carries exactly that decision's events.
    private currentEvents: DecisionEvent[] = [];

    async decide(game: Game): Promise<BotAction> {
        this.currentEvents = [];
        let query = "";
        try {
            query = this.state.is_first_turn_of_hand
                ? constructHandSetup(game, this.contextBuilder) + "\n\n" + constructTurnUpdate(game)
                : constructTurnUpdate(game);
            this.state.is_first_turn_of_hand = false;

            const action = await this.queryWithRetries(query, this.query_retries);
            this.emitDecision(query, action);
            return action;
        } catch (err) {
            this.logger.error("Error during decision, falling back to default action:", err);
            const fallback = await this.fallback();
            this.emitDecision(query, fallback);
            return fallback;
        }
    }

    // Record an engine event for the current decision and forward it to the sink.
    private recordEvent(event: DecisionEvent): void {
        this.currentEvents.push(event);
        this.onEvent?.(event);
    }

    private emitDecision(prompt: string, action: BotAction): void {
        this.onDecision?.({
            prompt,
            raw_response: this.ai.getLastRawResponse(),
            parsed_action: { action: action.action_str, amount: action.bet_size_in_BBs },
            events: this.currentEvents.slice(),
        });
    }

    private async queryWithRetries(query: string, retries: number, retry_counter: number = 0): Promise<BotAction> {
        if (retry_counter > retries) {
            const fallback = await this.fallback();
            this.recordEvent('fallback');
            this.logger.error(`Failed to query bot action, exceeded the retry limit after ${retries} attempts. Defaulting to ${fallback.action_str}.`);
            return fallback;
        }
        try {
            if (this.query_delay_ms > 0) await sleep(this.query_delay_ms);
            let action = await this.ai.query(query);
            // Parse failure (no "Final Answer:" line) -> one-shot rethink reprompt,
            // first attempt only. Genuine-but-illegal actions fall through to the
            // existing retry/clamp path instead.
            if (!action.action_str && retry_counter === 0) {
                this.recordEvent('rethink');
                this.logger.warn("No parseable Final Answer; sending one-shot rethink reprompt.");
                action = await this.ai.query(RETHINK_PROMPT);
            }
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
