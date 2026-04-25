import { convertToBBs, convertToValue } from '../core/poker/value-conversion.util.ts';

import { BotAction } from '../services/ai/ai-client.interface.ts';
import { PuppeteerService } from '../services/puppeteer/puppeteer.service.ts';

import { DebugMode, logResponse } from '../utils/error-handling.util.ts';

import { HandState } from './hand-state.ts';

export class ActionExecutor {
    constructor(
        private puppeteer: PuppeteerService,
        private state: HandState,
        private debug: DebugMode,
    ) {}

    async execute(decision: BotAction): Promise<void> {
        try {
            this.state.table.resetPlayerActions();
            await this.performBotAction(decision);
        } catch (err) {
            console.log("Failed to execute bot action:", err);
        }
        console.log("Waiting for bot's turn to end");
        logResponse(await this.puppeteer.waitForBotTurnEnd(), this.debug);
    }

    private async performBotAction(bot_action: BotAction): Promise<void> {
        console.log("Bot Action:", bot_action.action_str);
        const big_blind = this.state.game.getBigBlind();
        let bet_size = convertToValue(bot_action.bet_size_in_BBs, big_blind);
        switch (bot_action.action_str) {
            case "bet":
            case "raise":
                console.log("Bet Size:", convertToBBs(bet_size, big_blind));
                logResponse(await this.puppeteer.betOrRaise(bet_size), this.debug);
                break;
            case "all-in":
                bet_size = convertToValue(this.state.game.getHero()!.getStackSize(), big_blind);
                console.log("Bet Size:", convertToBBs(bet_size, big_blind));
                logResponse(await this.puppeteer.betOrRaise(bet_size), this.debug);
                break;
            case "call":
                logResponse(await this.puppeteer.call(), this.debug);
                break;
            case "check":
                logResponse(await this.puppeteer.check(), this.debug);
                break;
            case "fold":
                logResponse(await this.puppeteer.fold(), this.debug);
                const cancel_res = await this.puppeteer.cancelUnnecessaryFold();
                if (cancel_res.code === "success") {
                    logResponse(await this.puppeteer.check(), this.debug);
                }
                break;
        }
    }
}
