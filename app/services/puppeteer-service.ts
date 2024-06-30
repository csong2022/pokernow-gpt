import puppeteer from 'puppeteer';
import type { Response } from '../utils/error-handling-utils.ts';
import { letterToSuit } from '../utils/log-processing-utils.ts';
import { computeTimeout, GameInfo } from '../utils/bot-utils.ts';


const browser = await puppeteer.launch({
    defaultViewport: null,
    headless: false
});
const page = await browser.newPage();
const default_timeout = 1000;

export async function init<D, E=Error>(game_id: string): Response<D, E> {
    if (!game_id) {
        return {
            code: "error",
            error: new Error("Game id cannot be empty.") as E
        }
    }
    await page.goto(`https://www.pokernow.club/games/${game_id}`);
    await page.setViewport({width: 1024, height: 768});
    return {
        code: "success",
        data: null as D,
        msg: `Successfully opened PokerNow game with id ${game_id}.`
    }
}

export async function waitForGameInfo<D, E=Error>(): Response<D, E> {
    try {
        await page.waitForSelector('.game-infos > .blind-value-ctn > .blind-value > span', {timeout: default_timeout * 60});
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

export async function getGameInfo<D, E=Error>(): Response<D, E> {
    var game_info;
    try {
        game_info = await page.$eval(".game-infos > .blind-value-ctn > .blind-value > span", (span: any) => span.textContent);
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

export function convertGameInfo(game_info: string): GameInfo {
    const re = RegExp("([A-Z]+)\\s~\\s[0-9]+\\s\/\\s([0-9]+)");
    const matches = re.exec(game_info);
    if (matches && matches.length == 3) {
        return {game_type: matches[1], stakes: Number(matches[2])};
    } else {
        throw new Error("Failed to convert game info.");
    }
}

// send enter table request as non-host player
export async function sendEnterTableRequest<D, E=Error>(name: string, stack_size: number): Response<D, E> {
    if (name.length < 2 || name.length > 14) {
        return {
            code: "error",
            error: new Error("Player name must be betwen 2 and 14 characters long.") as E
        }
    }
    try {
        await page.$eval(".table-player-seat-button", (button: any) => button.click());
    } catch (err) {
        return {
            code: "error",
            error: new Error("Could not find open seat.") as E
        }
    }
    await page.focus(".selected > div > form > div:nth-child(1) > input");
    await page.keyboard.type(name);
    await page.focus(".selected > div > form > div:nth-child(2) > input");
    await page.keyboard.type(stack_size.toString())
    await page.$eval(".selected > div > form > button", (button: any) => button.click());
    try {
        await page.waitForSelector(".alert-1-buttons > button", {timeout: default_timeout});
        await page.$eval(".alert-1-buttons > button", (button: any) => button.click());
    } catch (err) {
        var message = "Table ingress unsuccessful."
        if (await page.$(".selected > div > form > div:nth-child(1) > .error-message")) {
            message = "Player name must be unique to game.";
        }
        await page.$eval(".selected > button", (button: any) => button.click());
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

// wait until table entry
export async function waitForTableEntry<D, E=Error>(): Response<D, E> {
    try {
        await page.waitForSelector(".you-player");
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
export async function waitForNextHand<D, E=Error>(num_players: number, max_turn_length: number): Response<D, E> {
    // check if the player is in a waiting state
    // if not, return
    try {
        await page.waitForSelector([".you-player > .waiting", ".you-player > .waiting-next-hand"].join(','), {timeout: default_timeout});
    } catch (err) {
        return {
            code: "error",
            error: new Error("Player is not in waiting state.") as E
        }
    }
    // if player is in waiting state, wait for the waiting state to disappear
    try {
        await page.waitForSelector([".you-player > .waiting", ".you-player > .waiting-next-hand"].join(','), {hidden: true, timeout: computeTimeout(num_players, max_turn_length, 4) + default_timeout});
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

export async function getNumPlayers<D, E=Error>(): Response<D, E> {
    try {
        await page.waitForSelector(".table-player", {timeout: default_timeout});
        const table_players_count = await page.$$eval(".table-player", (divs: any) => divs.length) as number;
        const table_player_status_count = await page.$$eval(".table-player-status-icon", (divs: any) => divs.length) as number;
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
export async function waitForBotTurnOrWinner<D, E=Error>(num_players: number, max_turn_length: number): Response<D, E> {
    try {
        //await page.waitForSelector('.table-player.winner', {timeout: default_timeout});
        const el = await page.waitForSelector([".action-signal", ".table-player.winner"].join(','), {timeout: computeTimeout(num_players, max_turn_length, 4) + default_timeout});
        const class_name = await page.evaluate(el => el!.className, el);
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

export async function waitForBotTurnEnd<D, E=Error>(): Response<D, E> {
    try {
        await page.waitForSelector(".action-signal", {hidden: true, timeout: default_timeout * 15});
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

export async function getHand<D, E=Error>(): Response<D, E> {
    try {
        const cards_div = await page.$$(".you-player > .table-player-cards > div");
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

// wait for the current hand to finish after a winner has been decided (when the "winner" elem is no longer present)
export async function waitForHandEnd<D, E=Error>(): Response<D, E> {
    try {
        await page.waitForSelector(".table-player.winner", {hidden: true, timeout: default_timeout * 10});
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

export async function getStackSize<D, E=Error>(): Response<D, E> {
    try {
        await page.waitForSelector(".you-player > .table-player-infos-ctn > div > .table-player-stack");
        const stack_size_str = await page.$eval(".you-player > .table-player-infos-ctn > div > .table-player-stack", (p: any) => p.textContent);
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
export async function waitForCallOption<D, E=Error>(): Response<D, E> {
    try {
        const is_disabled = await page.$eval(".game-decisions-ctn > .action-buttons > .call", (button: any) => button.disabled);
        if (is_disabled) {
            throw new Error("Call option is disabled.")
        }
        await page.waitForSelector(".game-decisions-ctn > .action-buttons > .call", {timeout: default_timeout});
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

export async function call<D, E=Error>(): Response<D, E> {
    try {
        await page.$eval(".game-decisions-ctn > .action-buttons > .call", (button: any) => button.click());
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

export async function fold<D, E=Error>(): Response<D, E> {
    try {
        await page.waitForSelector(".game-decisions-ctn > .action-buttons > .fold", {timeout: default_timeout});
        await page.$eval(".game-decisions-ctn > .action-buttons > .fold", (button: any) => button.click());
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

export async function cancelUnnecessaryFold<D, E=Error>(): Response<D, E> {
    const fold_alert_text = "Are you sure that you want do an unnecessary fold?Do not show this again in this session? "
    try {
        await page.waitForSelector(".alert-1", {timeout: default_timeout});
        const text = await page.$eval(".alert-1 > .content", (div: any) => div.textContent);
        if (text === fold_alert_text) {
            await page.$eval(".alert-1 > .alert-1-buttons > .button-1.red", (button: any) => button.click());
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

export async function waitForCheckOption<D, E=Error>(): Response<D, E> {
    try {
        const is_disabled = await page.$eval(".game-decisions-ctn > .action-buttons > .check", (button: any) => button.disabled);
        if (is_disabled) {
            throw new Error("Check option is disabled.")
        }
        await page.waitForSelector(".game-decisions-ctn > .action-buttons > .check", {timeout: default_timeout});
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

export async function check<D, E=Error>(): Response<D, E> {
    try {
        await page.waitForSelector(".game-decisions-ctn > .action-buttons > .check", {timeout: default_timeout});
        await page.$eval(".game-decisions-ctn > .action-buttons > .check", (button: any) => button.click());
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

export async function waitForBetOption<D, E=Error>(): Response<D ,E> {
    try {
        const is_disabled = await page.$eval(".game-decisions-ctn > .action-buttons > .raise", (button: any) => button.disabled);
        if (is_disabled) {
            throw new Error("Bet or raise option is disabled.")
        }
        await page.waitForSelector(".game-decisions-ctn > .action-buttons > .raise", {timeout: default_timeout});
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

export async function betOrRaise<D, E=Error>(bet_amount: number): Response<D, E> {
    try {
        const bet_action = await page.$eval(".game-decisions-ctn > .action-buttons > .raise", (button: any) => button.textContent);
        await page.$eval(".game-decisions-ctn > .action-buttons > .raise", (button: any) => button.click());

        if (bet_action === "Raise") {
            const res = await getCurrentBet();
            if (res.code === "success") {
                const current_bet = res.data as number;
                bet_amount += current_bet;
            }
        }
        await page.waitForSelector(".game-decisions-ctn > form > .raise-bet-value > div > input", {timeout: default_timeout});
        await page.focus(".game-decisions-ctn > form > .raise-bet-value > div > input");
        await page.keyboard.type(bet_amount.toString());
        await page.waitForSelector(".game-decisions-ctn > form > .action-buttons > .bet", {timeout: default_timeout});
        await page.$eval(".game-decisions-ctn > form > .action-buttons > .bet", (input: any) => input.click());
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

export async function getCurrentBet<D, E=Error>(): Response<D, E> {
    try {
        const el = await page.waitForSelector(".you-player > .table-player-bet-value", {timeout: default_timeout});
        const current_bet = await page.evaluate(el => el!.textContent, el);
        return {
            code: "success",
            data: parseFloat(current_bet!) as D,
            msg: `Successfully retrieved current bet amount: ${current_bet}`
        }
    } catch (err) {
        return {
            code: "error",
            error: new Error("No existing bet amount found.") as E
        }
    }
}