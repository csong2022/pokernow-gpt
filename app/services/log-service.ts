import puppeteer from 'puppeteer';
import type { Response } from '../utils/error-handling-utils.ts';
import { Data, Log } from '../interfaces/log-processing-interfaces.ts';

export class LogService {
    private game_id: string;
    private browser!: puppeteer.Browser;
    private page!: puppeteer.Page;
    
    constructor(game_id: string) {
        this.game_id = game_id;
    }

    async init(): Promise<void> {
        this.browser = await puppeteer.launch({
            defaultViewport: null,
            headless: true
        });
        this.page = await this.browser.newPage();
    }

    async closeBrowser(): Promise<void> {
        await this.browser.close();
    }

    async fetchData<D, E=Error>(before: string = "", after: string = ""): Response<D, E> {
        const url = `https://www.pokernow.club/games/${this.game_id}/log?before_at=${before}&after_at=${after}&mm=false&v=2`;
        await this.page.goto(url);
        try {
            await this.page.waitForSelector("body > pre", {timeout: 4000});
            const logs_str = await this.page.$eval("body > pre", pre => pre.textContent);
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
    }
    
    getData(log: any): Data {
        const data = log.data as JSON;
        const str = JSON.stringify(data);
        const res = JSON.parse(str) as Data;
        return res;
    }
    
    getMsg(data: Data): Array<string> {
        const res = new Array<string>;
        data.logs.forEach((element) => {
            res.push(element.msg)
        });
        return res;
    }
    
    getCreatedAt(data: Data): Array<string> {
        const res = new Array<string>;
        data.logs.forEach((element) => {
            res.push(element.created_at)
        });
        return res;
    }
    
    getLast(arr: Array<string>): string {
        return arr[arr.length - 1];
    }
    
    getFirst(arr: Array<string>): string {
        return arr[0];
    }
    
    pruneLogsBeforeCurrentHand(data: Data): Data {
        //starts from the top of logs
        const log_arr = new Array<Log>;
        let i = 0;
        while ((i < data.logs.length) && !(data.logs[i].msg.includes("starting hand #"))) {
            log_arr.push(data.logs[i]);
            i += 1;
        }
        log_arr.push(data.logs[i]);
        return {
            logs: log_arr
        }
    }
}
