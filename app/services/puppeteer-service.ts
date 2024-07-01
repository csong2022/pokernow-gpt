import puppeteer from 'puppeteer';

import { computeTimeout } from '../helpers/bot-helper.ts';

import type { Response } from '../utils/error-handling-utils.ts';
import { letterToSuit } from '../utils/log-processing-utils.ts';

interface GameInfo {
    game_type: string,
    big_blind: number,
    small_blind: number,
}

export class PuppeteerService {
    private default_timeout: number;
    private headless_flag: boolean;

    private browser!: puppeteer.Browser;
    private page!: puppeteer.Page;

    constructor(default_timeout: number, headless_flag: boolean) {
        this.default_timeout = default_timeout;
        this.headless_flag = headless_flag;
    }

    async init(): Promise<void> {
        this.browser = await puppeteer.launch({
            defaultViewport: null,
            headless: this.headless_flag
        });
        this.page = await this.browser.newPage();
    }

    async closeBrowser(): Promise<void> {
        await this.browser.close();
    }
    
    async navigateToGame<D, E=Error>(game_id: string): Response<D, E> {
        if (!game_id) {
            return {
                code: "error",
                error: new Error("Game id cannot be empty.") as E
            }
        }
        await this.page.goto(`https://www.pokernow.club/games/${game_id}`);
        await this.page.setViewport({width: 1024, height: 768});
        return {
            code: "success",
            data: null as D,
            msg: `Successfully opened PokerNow game with id ${game_id}.`
        }
    }
    
    async waitForGameInfo<D, E=Error>(): Response<D, E> {
        try {
            await this.page.waitForSelector('.game-infos > .blind-value-ctn > .blind-value > span', {timeout: this.default_timeout * 60});
        } catch (err) {
            return {
                code: "error",
                error: new Error("Failed to wait for game information.") as E
            }
        }
        return {
            code: "success",
            data: null as D,
            msg: "Successfully waited for game information."
        }
    }
    
    async getGameInfo<D, E=Error>(): Response<D, E> {
        var game_info;
        try {
            game_info = await this.page.$eval(".game-infos > .blind-value-ctn > .blind-value > span", (span: any) => span.textContent);
        } catch (err) {
            return {
                code: "error",
                error: new Error("Could not get game info.") as E
            }
        }
        return {
            code: "success",
            data: game_info as D,
            msg: "Successfully grabbed the game info."
        }
    }
    
    convertGameInfo(game_info: string): GameInfo {
        const re = RegExp("([A-Z]+)\\s~\\s([0-9]+)\\s\/\\s([0-9]+)");
        const matches = re.exec(game_info);
        if (matches && matches.length == 4) {
            return {game_type: matches[1], big_blind: Number(matches[3]), small_blind: Number(matches[2])};
        } else {
            throw new Error("Failed to convert game info.");
        }
    }
    
    // send enter table request as non-host player
    async sendEnterTableRequest<D, E=Error>(name: string, stack_size: number): Response<D, E> {
        if (name.length < 2 || name.length > 14) {
            return {
                code: "error",
                error: new Error("Player name must be betwen 2 and 14 characters long.") as E
            }
        }
        try {
            await this.page.$eval(".table-player-seat-button", (button: any) => button.click());
        } catch (err) {
            return {
                code: "error",
                error: new Error("Could not find open seat.") as E
            }
        }
        await this.page.focus(".selected > div > form > div:nth-child(1) > input");
        await this.page.keyboard.type(name);
        await this.page.focus(".selected > div > form > div:nth-child(2) > input");
        await this.page.keyboard.type(stack_size.toString())
        await this.page.$eval(".selected > div > form > button", (button: any) => button.click());
        try {
            await this.page.waitForSelector(".alert-1-buttons > button", {timeout: this.default_timeout});
            await this.page.$eval(".alert-1-buttons > button", (button: any) => button.click());
        } catch (err) {
            var message = "Table ingress unsuccessful."
            if (await this.page.$(".selected > div > form > div:nth-child(1) > .error-message")) {
                message = "Player name must be unique to game.";
            }
            await this.page.$eval(".selected > button", (button: any) => button.click());
            return {
                code: "error",
                error: new Error(message) as E
            }
        }
        return {
            code: "success",
            data: null as D,
            msg: "Table ingress request successfully sent."
        }
    }
    
    async waitForTableEntry<D, E=Error>(): Response<D, E> {
        try {
            await this.page.waitForSelector(".you-player");
        } catch (err) {
            return {
                code: "error",
                error: new Error("Table ingress request not accepted by host.") as E
            }
        }
        return {
            code: "success",
            data: null as D,
            msg: "Successfully entered table."
        }
    }
    
    // game has not started yet -> "waiting state"
    // joined when hand is currently in progress -> "in next hand"
    // if player is in waiting state, wait for next hand
    // otherwise, return
    async waitForNextHand<D, E=Error>(num_players: number, max_turn_length: number): Response<D, E> {
        // check if the player is in a waiting state
        // if not, return
        try {
            await this.page.waitForSelector([".you-player > .waiting", ".you-player > .waiting-next-hand"].join(','), {timeout: this.default_timeout});
        } catch (err) {
            return {
                code: "error",
                error: new Error("Player is not in waiting state.") as E
            }
        }
        // if player is in waiting state, wait for the waiting state to disappear
        try {
            await this.page.waitForSelector([".you-player > .waiting", ".you-player > .waiting-next-hand"].join(','), 
            {hidden: true, timeout: computeTimeout(num_players, max_turn_length, 4) + this.default_timeout});
        } catch (err) {
            return {
                code: "error",
                error: new Error("Player is not in waiting state.") as E
            }
        }
        return {
            code: "success",
            data: null as D,
            msg: "Waited for next hand to start."
        }
    }
    
    async getNumPlayers<D, E=Error>(): Response<D, E> {
        try {
            await this.page.waitForSelector(".table-player", {timeout: this.default_timeout});
            const table_players_count = await this.page.$$eval(".table-player", (divs: any) => divs.length) as number;
            const table_player_status_count = await this.page.$$eval(".table-player-status-icon", (divs: any) => divs.length) as number;
            const num_players = table_players_count - table_player_status_count;
            return {
                code: "success",
                data: num_players as D,
                msg: `Successfully got number of players in table: ${num_players}`
            }
        } catch (err) {
            return {
                code: "error",
                error: new Error("Failed to compute number of players in table.") as E
            }
        }
    
    }
    
    // wait for bot's turn or winner of hand has been determined
    async waitForBotTurnOrWinner<D, E=Error>(num_players: number, max_turn_length: number): Response<D, E> {
        try {
            //await page.waitForSelector('.table-player.winner', {timeout: default_timeout});
            const el = await this.page.waitForSelector([".action-signal", ".table-player.winner"].join(','), {timeout: computeTimeout(num_players, max_turn_length, 4) + this.default_timeout});
            const class_name = await this.page.evaluate(el => el!.className, el);
            return {
                code: "success",
                data: class_name as D,
                msg: `Waited for ${class_name}`
            }
        } catch (err) {
            return {
                code: "error",
                error: new Error("It is not the player's turn.") as E
            }
        }
    }
    
    async waitForBotTurnEnd<D, E=Error>(): Response<D, E> {
        try {
            await this.page.waitForSelector(".action-signal", {hidden: true, timeout: this.default_timeout * 15});
        } catch (err) {
            return {
                code: "error",
                error: new Error("Failed to wait for bot's turn to end.") as E
            }
        }
        return {
            code: "success",
            data: null as D,
            msg: "Successfully waited for bot's turn to end."
        }
    }
    
    async getHand<D, E=Error>(): Response<D, E> {
        try {
            const cards_div = await this.page.$$(".you-player > .table-player-cards > div");
            let cards: string[] = [];
            for (const card_div of cards_div) {
                const card_value = await card_div.$eval(".value", (span: any) => span.textContent);
                const sub_suit_letter = await card_div.$eval(".sub-suit", (span: any) => span.textContent);
                if (card_value && sub_suit_letter && letterToSuit.has(sub_suit_letter)) {
                    cards.push(card_value + letterToSuit.get(sub_suit_letter)!);
                } else {
                    throw "Invalid card.";
                }
            }
            return {
                code: "success",
                data: cards as D,
                msg: "Successfully retrieved player's hand."
            }
        } catch (err) {
            return {
                code: "error",
                error: new Error("Failed to retrieve player's hand.") as E
            }
        }
    }
    
    async getStackSize<D, E=Error>(): Response<D, E> {
        try {
            await this.page.waitForSelector(".you-player > .table-player-infos-ctn > div > .table-player-stack");
            const stack_size_str = await this.page.$eval(".you-player > .table-player-infos-ctn > div > .table-player-stack", (p: any) => p.textContent);
            return {
                code: "success",
                data: stack_size_str as D,
                msg: "Successfully retrieved bot's stack size."
            }
        } catch (err) {
            return {
                code: "error",
                error: new Error("Failed to retrieve bot's stack size.") as E
            }
        }
    }

    async waitForCallOption<D, E=Error>(): Response<D, E> {
        try {
            await this.page.waitForSelector(".game-decisions-ctn > .action-buttons > .call", {timeout: this.default_timeout});
            const is_disabled = await this.page.$eval(".game-decisions-ctn > .action-buttons > .call", (button: any) => button.disabled);
            if (is_disabled) {
                throw new Error("Call option is disabled.")
            }
        } catch (err) {
            return {
                code: "error",
                error: new Error("No option to call available.") as E
            }
        }
        return {
            code: "success",
            data: null as D,
            msg: "Successfully waited for call option."
        }
    }
    
    async call<D, E=Error>(): Response<D, E> {
        try {
            await this.page.$eval(".game-decisions-ctn > .action-buttons > .call", (button: any) => button.click());
        } catch (err) {
            return {
                code: "error",
                error: new Error("Failed to execute call action.") as E
            }
        }
        return {
            code: "success",
            data: null as D,
            msg: "Successfully executed call action."
        }
    }
    
    async waitForFoldOption<D, E=Error>(): Response<D, E> {
        try {
            await this.page.waitForSelector(".game-decisions-ctn > .action-buttons > .fold", {timeout: this.default_timeout});
            const is_disabled = await this.page.$eval(".game-decisions-ctn > .action-buttons > .fold", (button: any) => button.disabled);
            if (is_disabled) {
                throw new Error("Fold option is disabled.")
            }
        } catch (err) {
            return {
                code: "error",
                error: new Error("No option to fold available.") as E
            }
        }
        return {
            code: "success",
            data: null as D,
            msg: "Successfully waited for fold option."
        }
    }

    async fold<D, E=Error>(): Response<D, E> {
        try {
            await this.page.waitForSelector(".game-decisions-ctn > .action-buttons > .fold", {timeout: this.default_timeout});
            await this.page.$eval(".game-decisions-ctn > .action-buttons > .fold", (button: any) => button.click());
        } catch (err) {
            return {
                code: "error",
                error: new Error("No option to fold available.") as E
            }
        }
        return {
            code: "success",
            data: null as D,
            msg: "Successfully executed fold action."
        }
    }
    
    async cancelUnnecessaryFold<D, E=Error>(): Response<D, E> {
        const fold_alert_text = "Are you sure that you want do an unnecessary fold?Do not show this again in this session? "
        try {
            await this.page.waitForSelector(".alert-1", {timeout: this.default_timeout});
            const text = await this.page.$eval(".alert-1 > .content", (div: any) => div.textContent);
            if (text === fold_alert_text) {
                await this.page.$eval(".alert-1 > .alert-1-buttons > .button-1.red", (button: any) => button.click());
            }
        } catch (err) {
            return {
                code: "error",
                error: new Error("No option to cancel unnecessary fold available.") as E
            }
        }
        return {
            code: "success",
            data: null as D,
            msg: "Successfully cancelled unnecessary fold."
        }
    }
    
    async waitForCheckOption<D, E=Error>(): Response<D, E> {
        try {
            await this.page.waitForSelector(".game-decisions-ctn > .action-buttons > .check", {timeout: this.default_timeout});
            const is_disabled = await this.page.$eval(".game-decisions-ctn > .action-buttons > .check", (button: any) => button.disabled);
            if (is_disabled) {
                throw new Error("Check option is disabled.")
            }
        } catch (err) {
            return {
                code: "error",
                error: new Error("No option to check available.") as E
            }
        }
        return {
            code: "success",
            data: null as D,
            msg: "Successfully waited for check option."
        }
    }
    
    async check<D, E=Error>(): Response<D, E> {
        try {
            await this.page.waitForSelector(".game-decisions-ctn > .action-buttons > .check", {timeout: this.default_timeout});
            await this.page.$eval(".game-decisions-ctn > .action-buttons > .check", (button: any) => button.click());
        } catch (err) {
            return {
                code: "error",
                error: new Error("No option to check available.") as E
            }
        }
        return {
            code: "success",
            data: null as D,
            msg: "Successfully executed check action."
        }
    }
    
    async waitForBetOption<D, E=Error>(): Response<D ,E> {
        try {
            await this.page.waitForSelector(".game-decisions-ctn > .action-buttons > .raise", {timeout: this.default_timeout});
            const is_disabled = await this.page.$eval(".game-decisions-ctn > .action-buttons > .raise", (button: any) => button.disabled);
            if (is_disabled) {
                throw new Error("Bet or raise option is disabled.")
            }
        } catch (err) {
            return {
                code: "error",
                error: new Error("No option to bet or raise available.") as E
            }
        }
        return {
            code: "success",
            data: null as D,
            msg: "Successfully waited for bet or raise option."
        }
    }
    
    async betOrRaise<D, E=Error>(bet_amount: number): Response<D, E> {
        try {
            const bet_action = await this.page.$eval(".game-decisions-ctn > .action-buttons > .raise", (button: any) => button.textContent);
            await this.page.$eval(".game-decisions-ctn > .action-buttons > .raise", (button: any) => button.click());
    
            if (bet_action === "Raise") {
                const res = await this.getCurrentBet();
                if (res.code === "success") {
                    const current_bet = res.data as number;
                    bet_amount += current_bet;
                }
            }
            await this.page.waitForSelector(".game-decisions-ctn > form > .raise-bet-value > div > input", {timeout: this.default_timeout});
            await this.page.focus(".game-decisions-ctn > form > .raise-bet-value > div > input");
            await this.page.keyboard.type(bet_amount.toString());
            await this.page.waitForSelector(".game-decisions-ctn > form > .action-buttons > .bet", {timeout: this.default_timeout});
            await this.page.$eval(".game-decisions-ctn > form > .action-buttons > .bet", (input: any) => input.click());
        } catch (err) {
            return {
                code: "error",
                error: new Error(`Failed to bet with amount ${bet_amount}.`) as E
            }
        }
        return {
            code: "success",
            data: null as D,
            msg: `Successfully executed bet action with amount ${bet_amount}.`
        }
    }
    
    async getCurrentBet<D, E=Error>(): Response<D, E> {
        try {
            const el = await this.page.waitForSelector(".you-player > .table-player-bet-value", {timeout: this.default_timeout});
            const current_bet = await this.page.evaluate((el: any) => isNaN(el.textContent) ? '0' : el.textContent, el);
            return {
                code: "success",
                data: parseFloat(current_bet) as D,
                msg: `Successfully retrieved current bet amount: ${current_bet}`
            }
        } catch (err) {
            return {
                code: "error",
                error: new Error("No existing bet amount found.") as E
            }
        }
    }

    async waitForHandEnd<D, E=Error>(): Response<D, E> {
        try {
            await this.page.waitForSelector(".table-player.winner", {hidden: true, timeout: this.default_timeout * 10});
        } catch (err) {
            return {
                code: "error",
                error: new Error("Failed to wait for hand to finish.") as E
            }
        }
        return {
            code: "success",
            data: null as D,
            msg: "Waited for hand to finish."
        }
    }
}
