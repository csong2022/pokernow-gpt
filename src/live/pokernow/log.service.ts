import type { Page } from 'puppeteer';
import type { Response } from '../../utils/error-handling.util.ts';
import { Data, Log } from '../../core/poker/log-processing.interface.ts';
import { sleep } from '../../utils/bot-timeout.helper.ts';

const MAX_429_RETRIES = 3;

// Result of the in-page fetch, mirroring the bits of the old Puppeteer Response we used.
interface FetchResult {
    status: number;
    ok: boolean;
    statusText: string;
    retryAfter: string | null;
    body: unknown;
}

export class LogService {
    private game_id: string;
    // Shared with PuppeteerService — the live game page (www.pokernow.com origin), so
    // the log API can be fetched same-origin without launching a second browser.
    private page!: Page;

    constructor(game_id: string) {
        this.game_id = game_id;
    }

    // Receives the shared game page from PuppeteerService (no browser of its own).
    async init(page: Page): Promise<void> {
        this.page = page;
    }

    // No-op: the page is owned by PuppeteerService, which closes the browser.
    async closeBrowser(): Promise<void> {}

    async fetchData<D, E=Error>(hand_number: number = 0, after: string = ""): Response<D, E> {
        const after_param = after ? `&after_at=${after}` : "";
        const url = `https://www.pokernow.com/api/games/${this.game_id}/log_v3?hand_number=${hand_number}${after_param}`;
        console.log(url);

        for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
            try {
                // Same-origin fetch from the game page (cheap; no full navigation). Parse
                // the body inside the page so only serializable data crosses back.
                const res = await this.page.evaluate(async (u): Promise<FetchResult> => {
                    const r = await fetch(u, { cache: 'no-store' });
                    let body: unknown = null;
                    try { body = r.ok ? await r.json() : null; } catch {}
                    return { status: r.status, ok: r.ok, statusText: r.statusText, retryAfter: r.headers.get('retry-after'), body };
                }, url);

                if (res.status === 429) {
                    if (attempt === MAX_429_RETRIES) {
                        return { code: "error", error: new Error(`Log API rate limited after ${MAX_429_RETRIES} retries.`) as E };
                    }
                    const retry_after_ms = res.retryAfter ? Math.min(parseInt(res.retryAfter) * 1000, 10000) : 0;
                    const backoff = Math.max(retry_after_ms, 1000 * Math.pow(2, attempt));
                    console.log(`Log API rate limited (429). Waiting ${backoff}ms before retry ${attempt + 1}/${MAX_429_RETRIES}.`);
                    await sleep(backoff);
                    continue;
                }

                if (!res.ok) {
                    return {
                        code: "error",
                        error: new Error(`Log API returned ${res.status}: ${res.statusText}`) as E
                    };
                }

                return { code: "success", data: res.body as D, msg: "Successfully got logs." };
            } catch (err) {
                return { code: "error", error: new Error(`Failed to fetch logs: ${err}`) as E };
            }
        }
        return { code: "error", error: new Error("Failed to fetch logs after retries.") as E };
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
        if (i < data.logs.length) {
            log_arr.push(data.logs[i]);
        }
        return {
            logs: log_arr
        }
    }
}
