import prompt from 'prompt-sync';
import * as puppeteer_service from './services/puppeteer-service.ts';
import { Game } from './models/game.ts';
import { Table } from './models/table.ts';
import { fetchData, getFirst, getCreatedAt, getData, getMsg } from './services/log-service.ts';
import { getPlayerStacksFromMsg, pruneFlop, pruneStarting, validateAllMsg } from './services/message-service.ts';
import { logResponse, DebugMode } from './utils/error-handling-utils.ts';
import type { LogsInfo } from './utils/log-processing-utils.ts';
import { constructQuery, postProcessLogs } from './services/query-service.ts';

export class Bot {
    private bot_name: string;
    private game: Game;
    private table: Table;
    private debug_mode: DebugMode;

    constructor(debug_mode: DebugMode, game: Game) {
        this.bot_name = "";
        this.game = game;
        this.debug_mode = debug_mode;
        this.table = game.getTable();
    }

    public async run() {
        await this.enterTableInProgress();
        // retrieve initial num players
        await this.updateNumPlayers();
        //TODO: implement loop until STOP SIGNAL (perhaps from UI?)
        while (true) {
            await this.waitForNextHand();
            await this.updateNumPlayers();
            console.log("Number of players in game:", this.table.getNumPlayers());
            this.table.setPlayersInPot(this.table.getNumPlayers());
            await this.playOneHand();
            this.table.nextHand();
        }
    }

    private async updateNumPlayers() {
        const res = await puppeteer_service.getNumPlayers();
        if (res.code === "success") {
            this.table.setNumPlayers(Number(res.data));
        }
    }

    private async enterTableInProgress() {
        const io = prompt();
        while (true) {
            const name = io("What is your desired player name? ");
            console.log(`Your player name will be ${name}.` )
            this.bot_name = name;
    
            const stack_size = io("What is your desired stack size? ");
            console.log(`Your initial stack size will be ${stack_size}.`)
    
            console.log(`Attempting to enter table with name: ${name} and stack size: ${stack_size}.`);
            const code = logResponse(await puppeteer_service.sendEnterTableRequest(name, Number(stack_size)), this.debug_mode);
    
            if (code === "success") {
                break;
            }
            console.log("Please try again.");
        }
        console.log("Waiting for table host to accept ingress request.");
        logResponse(await puppeteer_service.waitForTableEntry(), this.debug_mode);
    }

    private async waitForNextHand() {
        console.log("Waiting for next hand to start.")
        await puppeteer_service.waitForNextHand(this.table.getNumPlayers(), this.game.getMaxTurnLength());
    }

    // pull logs
    // wait for any player action to start
    // check if it is the player's turn -> perform actions
    // check if there is a winner -> perform end of hand actions
    private async playOneHand() {

        let logs_info = {
            last_created: "",
            first_fetch: true
        }
        while (true) {
            var res;
            // wait for the bot's turn -> perform actions
            // OR winner is detected -> pull all the logs
            console.log("Checking for bot's turn or winner of hand.");

            res = await puppeteer_service.waitForBotTurnOrWinner(this.table.getNumPlayers(), this.game.getMaxTurnLength());
            logResponse(res, this.debug_mode);

            if (res.code == "success") {
                logs_info = await this.pullLogs(logs_info.last_created, logs_info.first_fetch);
                const data = res.data as string;
                if (data.includes("action-signal")) {
                    console.log("Performing bot actions.");

                    // get hand
                    const hand = await this.getHand();

                    await this.updateHero(hand);

                    // post process logs and construct query
                    await postProcessLogs(this.table.getLogsQueue(), this.game);
                    console.log(constructQuery(this.game));

                    const io = prompt();
                    const action = io("What is your desired action? In format {action, bet size in BBs}");
                    const split = action.split(', ');
                    const act = split[0]
                    if (act == 'fold') {
                        logResponse(await puppeteer_service.fold(), this.debug_mode);
                    } else if (act == 'call') {
                        logResponse(await puppeteer_service.call(), this.debug_mode);
                    } else if (act == 'check') {
                        logResponse(await puppeteer_service.check(), this.debug_mode);
                    } else if (act == 'bet' || act == 'raise') {
                        logResponse(await puppeteer_service.bet(parseInt(split[1])), this.debug_mode);
                    }

                    console.log("Waiting for bot's turn to end");
                    logResponse(await puppeteer_service.waitForBotTurnEnd(), this.debug_mode);
                } else if (data.includes("winner")) {
                    break;
                }
            }
        }

        this.table.processPlayers();
        logResponse(await puppeteer_service.waitForHandEnd(), this.debug_mode);
        console.log("Completed a hand.");
    }

    private async pullLogs(last_created: string, first_fetch: boolean): Promise<LogsInfo> {
        const log = await fetchData(this.game.getGameId(), "", last_created);
        if (log.code === "success") {
            let res = getData(log);
            let msg = getMsg(res);
            if (first_fetch) {
                msg = pruneStarting(msg);
                this.table.setPlayerStacks(msg, this.game.getStakes());
                first_fetch = false;
            }
            let onlyValid = validateAllMsg(msg);
    
            this.table.preProcessLogs(onlyValid);
            this.table.convertAllOrdersToPosition();

            last_created = getFirst(getCreatedAt(res));
            return {
                last_created: last_created,
                first_fetch: first_fetch
            }
        } else {
            throw new Error("Failed to pull logs.");
        }
    }

    private async getHand(): Promise<string[]> {
        var hand: string[] = [];
        const res = await puppeteer_service.getHand();
        logResponse(res, this.debug_mode);
        if (res.code == "success") {
            hand = res.data as string[];
        }
        return hand;
    }

    private async updateHero(hand: string[]): Promise<void> {
        const hero = this.game.getHero();
        if (!hero) {
            this.game.createAndSetHero(this.bot_name, hand);
        } else {
            hero.setHand(hand);
        }
    }
}