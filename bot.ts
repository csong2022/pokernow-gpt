import prompt from 'prompt-sync';
import * as puppeteer_service from './app/services/puppeteer-service.ts';
import { Game } from './app/models/game.ts';
import { Table } from './app/models/table.ts';
import { fetchData, getFirst, getCreatedAt, getData, getMsg } from './app/services/log-service.ts';
import { pruneStarting, validateAllMsg } from './app/services/message-service.ts';
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

    // pull logs
    // wait for any player action to start
    // check if it is the player's turn -> perform actions
    // check if there is a winner -> perform end of hand actions
    private async playOneHand() {
        var lastCreated;
        while (true) {
            var res;
            const log = await fetchData("GET", this.game.getGameId(), "", lastCreated);
            if (log.code === "success") {
                let res = getData(log);
                let msg = getMsg(res);
                // first action by any player
                if (this.first_fetch) {
                    msg = pruneStarting(msg);
                    this.first_fetch = false;
                }
                let onlyValid = validateAllMsg(msg);
        
                this.table.preProcessLogs(onlyValid);
                console.log("onlyValid", onlyValid);
                this.table.convertDict();
                console.log("updated player positions")
                
                console.log(lastCreated);
        
                lastCreated = getFirst(getCreatedAt(res));
                console.log("updated lastCreated");
                console.log(lastCreated);
            }
        
            console.log("Waiting for next player action to start.");
            logResponse(await puppeteer_service.waitForNextPlayerAction(30), this.debug_mode);

            console.log("Checking for player's turn.");
            res = await puppeteer_service.waitForPlayerTurn();
            // player's turn
            if (res.code == "success") {
                // get my hole cards
                
            }
        
            console.log("Checking for winner.");
            res = await puppeteer_service.waitForWinner();
            // end of hand
            if (res.code == "success") {
                break;
            }
        }
        console.log("Waiting for hand to end.")
        logResponse(await puppeteer_service.waitForHandEnd(), this.debug_mode);
        console.log("Completed a hand.");
    }
}