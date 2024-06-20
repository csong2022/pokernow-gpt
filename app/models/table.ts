import { Player } from "./player.ts"
import { Queue } from "../utils/data-structures.ts"
import * as player_service from "../services/player-service.ts"
import { PlayerStats } from "./player-stats.ts";
import { Actions } from "../utils/log-processing-utils.ts";

const streets = ["Flop", "Turn", "River"]


export class Table {
    private logs_queue: Queue<Array<string>>;
    private num_players: number;
    private player_cache: Map<string, Player>;
    private player_positions: Map<string, string>;
    private pot: number;
    private runout: string;
    private player_action: Map<string, number>;

    constructor() {
        this.player_positions = new Map<string, string>();
        this.runout = "";
        this.pot = 0;
        this.logs_queue = new Queue();
        this.num_players = 0;
        this.player_cache = new Map<string, Player>();
        this.player_action = new Map<string, number>();
    }

    public processLogs(logs: Array<Array<string>>) {
        this.logs_queue = new Queue();
        logs = logs.reverse();
        logs.forEach((element) => {
            if (!(streets.includes(element[0]))) {
                if (!(this.player_positions.has(element[0]))) {
                    this.num_players += 1;
                    this.player_positions.set(element[0], this.num_players.toString())
                }
                this.logs_queue.enqueue(element);
            }
        })
        //console.log(this.queue)
        //console.log(this.dict)
    }

    public processStats(logs: Array<Array<string>>) {
        // 0 means they didn't put in money, 1 means they put in money but didn't raise (CALL)
        // 2 means they put in money through a raise. 1 -> vpip, 2 -> vpip & pfr
        // higher numbers override lower numbers
        const pfr = [Actions.BET, Actions.RAISE]
        logs.forEach((element) => {
            if (element.length > 3) {
                let id = element[0]
                let action = element[2]
                let actionNum = 0
                if (action == Actions.CALL) {
                    actionNum = 1
                } else if (action in pfr) {
                    actionNum = 2
                }
                if ((!(id in this.player_action)) || this.player_action.get(id)! < actionNum) {
                    this.player_action.set(id, actionNum);
                }
            }
        })
    }

    public popLogsQueue(): Array<string> | undefined{
        if (!(this.logs_queue.isEmpty())) {
            let res = this.logs_queue.dequeue()!;
            return res;
        }
        return undefined
    }

    public getLogsQueue(): Queue<Array<string>> {
        return this.logs_queue;
    }

    public cacheAndUpdatePlayer(msg: string): void {
        const player_id = msg[0];
        const player_name = msg[1];


        if (!this.player_cache.has(player_id)) {
            const player_str = player_service.get(player_id);
            // if the player does not currently exist in the database, create a new player in db
            // otherwise retrieve the existing player from database,
            // then, add player to player_cache and update player_stats based on the action in msg
            let player: Player;
            if (!player_str) {
                const new_player_stats = new PlayerStats(player_id);
                player_service.create(new_player_stats);
                player = new Player(player_name, new_player_stats);
            } else {
            }
        }
    }


    public getPlayerPositions(): Map<string, string> {
        return this.player_positions;
    }

    public convertPosition(curr: string | undefined, total_players: number): string {
        if (!(typeof curr === 'undefined')) {
            let num = parseInt(curr)
            if (num == total_players) {
                if (total_players == 2) {
                    return "BB"
                }
                return "BU";
            }
            if ((total_players >= 5) && (num == total_players - 1)) {
                return "CO";
            }
            if (total_players <= 6) {
                switch (num) {
                    case 1: return "SB";
                    case 2: return "BB";
                    case 3: return "UTG";
                    case 4: return "HJ";
                    default: return curr;
                }
            } else {
                switch (num) {
                    case 1: return "SB";
                    case 2: return "BB";
                    case 3: return "UTG";
                    case 4: return "UTG+1";
                    case 5: return "MP";
                    case 6: return "MP";
                    case 7: return "LJ";
                    case 8: return "HJ";
                    default: return curr;
                }
            }
        }
        return ""
    }

    public convertDict() {
        for (let key of this.player_positions.keys()) {
            this.player_positions.set(key, this.convertPosition(this.player_positions.get(key), this.num_players));
        }
        console.log(this.player_positions);
    }

    public nextHand(): void {
        this.player_positions = new Map<string, string>();
        this.num_players = 0;
        this.logs_queue = new Queue();
    }

    public getStreet(): string {
        if (this.runout.length == 0) {
            return "Preflop";
        } else if (this.runout.length == 3) {
            return "Flop";
        } else if (this.runout.length == 4) {
            return "Turn";
        } else if (this.runout.length == 5) {
            return "River";
        } else {
            console.error("Could not get runout street");
            return "Error";
        }
    }

    public updatePot(bet: number): void {
        this.pot += bet;
    }

    public getPot(): number {
        return this.pot;
    }

    public getRunout(): string {
        return this.runout;
    }

}