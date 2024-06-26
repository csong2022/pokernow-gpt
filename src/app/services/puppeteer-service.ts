import puppeteer from 'puppeteer';
import type { Response } from '../utils/error-handling-utils.ts';
import { letterToSuit } from '../utils/log-processing-utils.ts';
import * as bot_utils from '../utils/bot-utils.ts';


const browser = await puppeteer.launch({
    defaultViewport: null,
    headless: false
});
const page = await browser.newPage();
const default_timeout = 500;

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
        await page.waitForSelector('.game-infos > .blind-value-ctn > .blind-value > span', {timeout: 60000});
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
        game_info = await page.$eval('.game-infos > .blind-value-ctn > .blind-value > span', (span: any) => span.textContent);
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

export function convertGameInfo(game_info: string): any {
    const re = RegExp('([A-Z]+)\\s~\\s([0-9]+)\\s\/\\s[0-9]+');
    const matches = re.exec(game_info);
    if (matches && matches.length == 3) {
        return {stakes: matches[1], game_type: matches[2]};
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
        await page.waitForSelector([".you-player > .waiting", ".you-player > .waiting-next-hand"].join(','), {hidden: true, timeout: bot_utils.computeTimeout(num_players, max_turn_length, 4) + default_timeout});
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
        const table_players_count = await page.$$eval(".table-player", (divs: any) => divs.length);
        const table_player_status_count = await page.$$eval(".table-player-status-icon", (divs: any) => divs.length);
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
export async function waitForBotTurnOrWinner<D, E=Error>(): Response<D, E> {
    try {
        //await page.waitForSelector('.table-player.winner', {timeout: default_timeout});
        const el = await page.waitForSelector([".action-signal", ".table-player.winner"].join(','), {timeout: default_timeout * 600});
        const className = await page.evaluate(el => el!.className, el);
        return {
            code: "success",
            data: className as D,
            msg: `Waited for ${className}`
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
        await page.waitForSelector(".action-signal", {hidden: true, timeout: default_timeout * 10});
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
                console.log("Card: ", card_value + letterToSuit.get(sub_suit_letter)!);
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
        await page.waitForSelector('.table-player.winner', {hidden: true, timeout: default_timeout * 20});
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

export async function call<D, E=Error>(): Response<D, E> {
    try {
        await page.$eval('.game-decisions-ctn > .action-buttons > .call', (button: any) => button.click());
    } catch (err) {
        return {
            code: "error",
            error: new Error("No option to call available.") as E
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
        await page.$eval('.game-decisions-ctn > .action-buttons > .fold', (button: any) => button.click());
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

export async function check<D, E=Error>(): Response<D, E> {
    try {
        await page.$eval('.game-decisions-ctn > .action-buttons > .check', (button: any) => button.click());
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

export async function bet<D, E=Error>(bet_amount: number) {
    try {
        await page.$eval('.game-decisions-ctn > .action-buttons > .raise', (button: any) => button.click());
        await page.focus('.game-decisions-ctn > form > .raise-bet-value > div > input')
        await page.keyboard.type(bet_amount.toString());
        await page.$eval('.game-decisions-ctn > form > .action-buttons > .bet', (input: any) => input.click());
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