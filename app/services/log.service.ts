import puppeteer from 'puppeteer';
import type { Response } from '../utils/error-handling.util.ts';
import { Data, Log } from '../interfaces/log-processing.interface.ts';

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
        await this.page.setCacheEnabled(false);
    }

    async closeBrowser(): Promise<void> {
        await this.browser.close();
    }

    async fetchData<D, E=Error>(hand_number: number = 0, after: string = ""): Response<D, E> {
        const after_param = after ? `&after_at=${after}` : "";
        const url = `https://www.pokernow.com/api/games/${this.game_id}/log_v3?hand_number=${hand_number}${after_param}`;
        console.log(url);
        try {
            const res = await this.page.goto(url);
            if (!res || !res.ok()) {
                return {
                    code: "error",
                    error: new Error(`Log API returned ${res?.status()}: ${res?.statusText()}`) as E
                }
            }
            const data = await res.json() as D;
            return {
                code: "success",
                data,
                msg: "Successfully got logs."
            }
        } catch (err) {
            return {
                code: "error",
                error: new Error(`Failed to fetch logs: ${err}`) as E
            }
        }
    }

    getData(log: any): Data {
        const entries = (log.data ?? []) as Array<{ msg: string; createdAt: string }>;
        return {
            logs: entries.map(e => ({ at: "", created_at: e.createdAt, msg: e.msg }))
        };
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
