import { Game } from '../core/game/game.model.ts';
import { constructHandSetup, constructTurnUpdate } from '../core/poker/query-construction.helper.ts';

import { AIService, BotAction, defaultCheckAction, defaultFoldAction } from '../services/ai/ai-client.interface.ts';
import { PuppeteerService } from '../services/puppeteer/puppeteer.service.ts';

import { sleep, TimeoutError } from '../utils/bot-timeout.helper.ts';

import { HandState } from './hand-state.ts';

export class DecisionEngine {
    constructor(
        private ai: AIService,
        private puppeteer: PuppeteerService,
        private state: HandState,
        private query_retries: number,
    ) {}

    async decide(game: Game): Promise<BotAction> {
        try {
            const query = this.state.is_first_turn_of_hand
                ? constructHandSetup(game) + "\n\n" + constructTurnUpdate(game)
                : constructTurnUpdate(game);
            this.state.is_first_turn_of_hand = false;

            return await this.queryWithRetries(query, this.query_retries);
        } catch (err) {
            console.log("Error during decision, falling back to default action:", err);
            return await this.fallback();
        }
    }

    private async queryWithRetries(query: string, retries: number, retry_counter: number = 0): Promise<BotAction> {
        if (retry_counter > retries) {
            const fallback = await this.fallback();
            console.log(`Failed to query bot action, exceeded the retry limit after ${retries} attempts. Defaulting to ${fallback.action_str}.`);
            return fallback;
        }
        try {
            await sleep(2000);
            const action = await this.ai.query(query);
            if (await this.isValidBotAction(action)) {
                return action;
            }
            console.log("Invalid bot action, retrying query.");
            return await this.queryWithRetries(query, retries, retry_counter + 1);
        } catch (err) {
            if (err instanceof TimeoutError) {
                console.log("AI query timed out, defaulting to safe action.");
                return await this.fallback();
            }
            console.log("Error while querying AI service:", err, "retrying query.");
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
        console.log("Attempted Bot Action:", bot_action);
        const valid_actions: string[] = ["bet", "raise", "call", "check", "fold", "all-in"];
        const hero = this.state.game.getHero();
        if (!hero) return false;
        const curr_stack_size_in_BBs = hero.getStackSize();
        console.log("Bot Stack in BBs:", curr_stack_size_in_BBs);

        if (!bot_action.action_str || !valid_actions.includes(bot_action.action_str)) return false;

        let res;
        switch (bot_action.action_str) {
            case "bet":
            case "raise":
                //TODO: should also check that the raise >= min raise
                res = await this.puppeteer.waitForBetOption();
                return (
                    res.code === "success" &&
                    bot_action.bet_size_in_BBs > 0 &&
                    bot_action.bet_size_in_BBs <= curr_stack_size_in_BBs
                );
            case "all-in":
                res = await this.puppeteer.waitForBetOption();
                return res.code === "success";
            case "call":
                res = await this.puppeteer.waitForCallOption();
                return (
                    res.code === "success" &&
                    bot_action.bet_size_in_BBs > 0 &&
                    bot_action.bet_size_in_BBs <= curr_stack_size_in_BBs
                );
            case "check":
                res = await this.puppeteer.waitForCheckOption();
                return res.code === "success" && bot_action.bet_size_in_BBs == 0;
            case "fold":
                res = await this.puppeteer.waitForFoldOption();
                return res.code === "success" && bot_action.bet_size_in_BBs == 0;
        }
        return false;
    }
}
