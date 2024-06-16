import prompt from 'prompt-sync';
import * as puppeteer_service from './app/services/puppeteer-service.ts';
import { Game } from './app/models/game.ts';
import { Table } from './app/models/table.ts';
import { fetchData, getFirst, getCreatedAt, getData, getMsg } from './app/services/log-service.ts';
import { validateAllMsg } from './app/services/message-service.ts';
import { logResponse, DebugMode } from './app/utils/error-handling-utils.ts';


export class Bot {
    private game: Game;
    private table: Table;
    private debug_mode: DebugMode;
    private first_fetch: boolean;

    constructor(debug_mode: DebugMode, game: Game) {
        this.game = game;
        this.debug_mode = debug_mode;
        this.first_fetch = true;
        this.table = game.getTable();
    }

    public async run() {
        await this.enterTableInProgress();
        await this.waitForHand();
        //TODO: implement loop until STOP SIGNAL (perhaps from UI?)
        while (true) {
            await this.playOneHand();
        }
    }

    private async enterTableInProgress() {
        const io = prompt();
        while (true) {
            const name = io("What is your desired player name? ");
            console.log(`Your player name will be ${name}.` )
    
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

    private async waitForHand() {
        console.log("Waiting for next hand to start.")
        logResponse(await puppeteer_service.waitForNextHand(10, 30), this.debug_mode);
    }

    private async playOneHand() {
        var lastCreated;
        while (true) {
            console.log("Waiting for player turn to start.")
            await puppeteer_service.waitForPlayerTurn();
        
            var res;
            const log = await fetchData("GET", this.game.getGameId(), "", lastCreated)
            if (log.code === "success") {
                let res = getData(log)
                if (this.first_fetch) {
                    //pruneLog(res);
                    this.first_fetch = false;
                }
                //console.log("res", res)
                let onlyValid = validateAllMsg(getMsg(res))
        
                this.table.processLogs(onlyValid)
                console.log("onlyValid", onlyValid)
                //console.log(this.table.getQueue())
                this.table.convertDict()
                console.log("updated player positions")
                
                console.log(lastCreated)
                //console.log(this.table.getDict())
                //console.log(this.table.getQueue())
        
                lastCreated = getFirst(getCreatedAt(res))
                console.log("updated lastCreated")
                console.log(lastCreated)
            }
        
            res = await puppeteer_service.waitForPlayerTurn();
        
            console.log("Waiting for next player action to start.")
            logResponse(await puppeteer_service.waitForNextPlayerAction(30), this.debug_mode);
        
            res = await puppeteer_service.waitForWinner();
            if (res.code == "success") {
                break;
            }
        }
        console.log("Completed a hand.")
    }
}