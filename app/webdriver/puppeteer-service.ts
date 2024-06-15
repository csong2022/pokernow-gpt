import puppeteer from 'puppeteer';
import type { Response } from '../utils/error-handling-utils.ts';
import * as bot_utils from '../utils/bot-utils.ts';


const browser = await puppeteer.launch({
    defaultViewport: null,
    headless: false
});
const page = await browser.newPage();
const default_timeout = 500;

export async function init<D, E=Error>(game_id: string) : Response<D, E> {
    if (!game_id) {
        return {
            code: "error",
            error: new Error("Game id cannot be empty.") as E
        }
    }
    await page.goto(`https://www.pokernow.club/games/${game_id}`);
    await page.setViewport({width: 1920, height: 1080});
    return {
        code: "success",
        data: `Successfully opened PokerNow game with id ${game_id}.` as D
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
        data: "Table ingress request successfully sent." as D
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
        data: "Successfully entered table." as D
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
    // finally return
    return {
        code: "success",
        data: "Waited for next hand to start." as D
    }
}

// wait for player turn
export async function waitForPlayerTurn<D, E=Error>(): Response<D, E> {
    try {
        await page.waitForSelector(".decision-current.you-player", {timeout: default_timeout});
    } catch (err) {
        return {
            code: "error",
            error: new Error("It is not the player's turn.") as E
        }
    }
    return {
        code: "success",
        data: "Waited for player turn to start." as D
    }
}

export async function waitForPlayerAction<D, E=Error>(): Response<D, E> {
    try {
        await page.waitForSelector(".table-player.decision-current", {timeout: default_timeout});
    } catch (err) {
        return {
            code: "error",
            error: new Error("Failed to wait for player action.") as E
        }
    }
    return {
        code: "success",
        data: "Waited for player action." as D
    }
}

// player turn ends -> current player no longer has 'decision-current' class
// player turn ends AND someone has won the hand -> current player no longer has 'decision-current' class and some player has 'winner' class
export async function waitForNextPlayerAction<D, E=Error>(max_turn_length: number): Response<D, E> {
    try {
        const el = await page.waitForSelector(".table-player.decision-current", {timeout: default_timeout});
        await page.waitForFunction(
            (el: any) => !el.classList.contains("decision-current"), 
            {polling: "mutation", timeout: max_turn_length * 1000}, 
            el);
    } catch (err) {
        return { 
            code: "error",
            error: new Error("Next player action never started.") as E
        }
    }
    return {
        code: "success",
        data: "Waited for next player action." as D
    }

}

export async function waitForWinner<D, E=Error>(): Response<D, E> {
    try {
        await page.waitForSelector('.table-player.winner', {timeout: default_timeout});
    } catch (err) {
        return { 
            code: "error",
            error: new Error("Winner of hand not determined yet.") as E
        }
    }
    return {
        code: "success",
        data: "Winner of hand has been determined." as D
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
        data: "Successfully executed call action." as D
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
        data: "Successfully executed fold action." as D
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
        data: "Successfully executed check action." as D
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
        data: `Successfully executed bet action with amount ${bet_amount}.` as D
    }
}