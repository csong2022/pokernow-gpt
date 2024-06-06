import puppeteer from 'puppeteer';
import type { Response } from '../utils/error-handling-utils.ts';

const browser = await puppeteer.launch({
    defaultViewport: null,
    headless: false
});
const page = await browser.newPage();

export async function init(game_id: string) {
    await page.goto(`https://www.pokernow.club/games/${game_id}`);
    await page.setViewport({width: 1920, height: 1080});
}

export async function enterTable<D, E=Error>(name: string, stack_size: number): Response<D, E> {
    try {
        await page.$eval(".table-player-seat-button", (button: any) => button.click());
    } catch (err) {
        console.log("Could not find open seat", err.message);
        return {
            code: "error",
            error: new Error("Table ingress unsuccessful.") as E
        }
    }
    await page.focus(".selected > div > form > div:nth-child(1) > input");
    await page.keyboard.type(name);
    await page.focus(".selected > div > form > div:nth-child(2) > input");
    await page.keyboard.type(stack_size.toString())
    await page.$eval(".selected > div > form > button", (button: any) => button.click());
    try {
        await page.waitForSelector(".alert-1-buttons > button", {timeout: 2000});
        await page.$eval(".alert-1-buttons > button", (button: any) => button.click());
    } catch (err) {
        if (await page.$(".selected > div > form > div:nth-child(1) > .error-message")) {
            console.log("Player name must be unique to game");
        }
        return {
            code: "error",
            error: new Error("Table ingress unsuccessful.") as E
        }
    }
    return {
        code: "success",
        data: "Table ingress successful." as D
    }
}