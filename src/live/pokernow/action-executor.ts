import { convertToBBs, convertToValue } from '../../core/poker/value-conversion.util.ts';

import { BotAction } from '../../core/ai/ai-client.interface.ts';
import { PuppeteerService } from './puppeteer.service.ts';

import { DebugMode, logResponse } from '../../utils/error-handling.util.ts';
import { Logger } from '../../utils/logger.util.ts';

import { HandState } from '../../bot/hand-state.ts';

export class ActionExecutor {
    constructor(
        private puppeteer: PuppeteerService,
        private state: HandState,
        private logger: Logger,
        private debug: DebugMode,
    ) {}

    async execute(decision: BotAction): Promise<void> {
        try {
            this.state.table.resetPlayerActions();
            await this.performBotAction(decision);
        } catch (err) {
            this.logger.error("Failed to execute bot action:", err);
        }
        this.logger.info("Waiting for bot's turn to end");
        logResponse(await this.puppeteer.waitForBotTurnEnd(), this.debug);
    }

    private async performBotAction(bot_action: BotAction): Promise<void> {
        this.logger.info("Bot Action:", bot_action.action_str);
        const big_blind = this.state.game.getBigBlind();
        let bet_size = convertToValue(bot_action.bet_size_in_BBs, big_blind);
        switch (bot_action.action_str) {
            case "bet":
            case "raise":
                this.logger.info("Bet Size:", convertToBBs(bet_size, big_blind));
                logResponse(await this.puppeteer.betOrRaise(bet_size), this.debug);
                break;
            case "all-in": {
                // Hero's stack is what's remaining after blinds/prior bets this street; the
                // raise input expects the TOTAL bet, so we add chips already committed.
                const remaining = convertToValue(this.state.game.getHero()!.getStackSize(), big_blind);
                let committed = 0;
                const current_bet_res = await this.puppeteer.getCurrentBet();
                if (current_bet_res.code === "success") {
                    committed = Number(current_bet_res.data) || 0;
                }
                bet_size = remaining + committed;
                this.logger.info("Bet Size:", convertToBBs(bet_size, big_blind));
                logResponse(await this.puppeteer.betOrRaise(bet_size), this.debug);
                break;
            }
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
