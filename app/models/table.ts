import { Queue, Dictionary } from "../utils/data-structures.ts"

const streets = ["Flop", "Turn", "River"]


export class Table {
    private player_positions: Map<string, string>;
    private runout: string;
    private pot: number;
    private logs_queue: Queue<Array<string>>;
    private num_players: number;

    constructor() {
        this.player_positions = new Map<string, string>();
        this.runout = "";
        this.pot = 0;
        this.logs_queue = new Queue();
        this.num_players = 0;
    }

    public processLogs(logs: Array<Array<string>>) {
        logs = logs.reverse();
        logs.forEach((element) => {
            if (!(streets.includes(element[0]))) {
                if (!(element[0] in this.player_positions)) {
                    this.num_players += 1;
                    this.player_positions[element[0]] = this.num_players;
                }
                this.logs_queue.enqueue(element);
            }
        })
        //console.log(this.queue)
        //console.log(this.dict)
    }

    public getLogsQueue() {
        return this.logs_queue;
    }

    public getPlayerPositions() {
        return this.player_positions;
    }

    public convertPosition(num: number, total_players: number): string {
        if (num == total_players) {
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
                default: return "";
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
                default: return "";
            }
        }
    }

    public convertDict() {
        for (let key of this.player_positions.keys()) {
            this.player_positions.set(key, this.convertPosition(parseInt(this.player_positions.get(key)!), this.num_players));
        }
        //console.log(this.player_positions.keys());
    }

    public nextHand(): void {
        this.player_positions = new Map<string, string>();
        this.num_players = 0;
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

    public getRunout(): string {
        return this.runout;
    }

    public updatePot(bet: number): void {
        this.pot += bet;
    }

    public getPot(): number {
        return this.pot;
    }
}