import puppeteer from 'puppeteer';
import type { Response } from '../utils/error-handling-utils.ts';
import { Data } from '../utils/log-processing-utils.ts';

//TODO: init function here
const browser = await puppeteer.launch({
    defaultViewport: null,
    headless: true
});
const page = await browser.newPage();

export const fetchData = async <D, E=Error>(
    game_id: string,
    before: string = "",
    after: string = ""
): Response<D, E> => {
    const url = `https://www.pokernow.club/games/${game_id}/log?before_at=${before}&after_at=${after}&mm=false&v=2`;
    await page.goto(url);
    try {
        await page.waitForSelector("body > pre", {timeout: 2000});
        const logs_str = await page.$eval("body > pre", pre => pre.textContent);
        return {
            code: "success",
            data: JSON.parse(logs_str!) as D,
            msg: "Successfully got logs."
        }
    } catch (err) {
        return {
            code: "error",
            error: new Error("Failed to retrieve the text content of the api call.") as E
        }
    }

};

export function closeBrowser(): void {
    browser.close();
}

export function getData(log: any): Data {
    const data = log.data as JSON;
    const str = JSON.stringify(data);
    const res = JSON.parse(str) as Data;
    return res;
}

export function getMsg(data: Data): Array<string> {
    const res = new Array<string>;
    data.logs.forEach((element) => {
        res.push(element.msg)
    });
    return res;
}

export function getCreatedAt(data: Data): Array<string> {
    const res = new Array<string>;
    data.logs.forEach((element) => {
        res.push(element.created_at)
    });
    return res;
}

export function getLast(arr: Array<string>): string {
    return arr[arr.length - 1];
}

export function getFirst(arr: Array<string>): string {
    return arr[0];
}