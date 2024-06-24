import * as player_service from "../services/player-service.ts"
import { Action } from "../utils/log-processing-utils.ts";
import { Player } from "./player.ts"
import { PlayerAction } from "./player-action.ts";
import { PlayerStats } from "./player-stats.ts";
import { Queue } from "../utils/data-structures.ts"
import { pruneFlop, pruneStarting, getPlayerStacksMsg } from "../services/message-service.ts";

const streets = ["Flop", "Turn", "River"];

export class Table {
    private logs_queue: Queue<Array<string>>;
    private num_players: number;
    private player_cache: Map<string, Player>;
    private player_positions: Map<string, string>;
    private pot: number;
    private runout: string;
    //TODO: rename this
    private player_action: Map<string, number>;
    private player_actions: Array<PlayerAction>;
    private all_in_runout: boolean;
    private player_stacks: Map<string, number>;

    constructor() {
        this.logs_queue = new Queue();
        this.num_players = 0;
        this.player_cache = new Map<string, Player>();
        this.player_positions = new Map<string, string>();
        this.pot = 0;
        this.runout = "";
        this.player_action = new Map<string, number>();
        this.player_actions = new Array<PlayerAction>;
        this.all_in_runout = false;
        this.player_stacks = new Map<string, number>();
    }

    public preProcessLogs(logs: Array<Array<string>>) {
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
    }

    public processStats(logs: Array<Array<string>>) {
        // 0 means they didn't put in money, 1 means they put in money but didn't raise (CALL)
        // 2 means they put in money through a raise. 1 -> vpip, 2 -> vpip & pfr
        // higher numbers override lower numbers
        const pfr = [Action.BET, Action.RAISE];
        logs.forEach((element) => {
            if (element.length > 3) {
                let id = element[0];
                let action = element[2];
                let actionNum = 0;
                if (action == Action.CALL) {
                    actionNum = 1;
                } else if (action in pfr) {
                    actionNum = 2;
                }
                if ((!(id in this.player_action)) || this.player_action.get(id)! < actionNum) {
                    this.player_action.set(id, actionNum);
                }
            }
        })
    }

    public getPlayerStacks(): Map<string, number> {
        return this.player_stacks;
    }

    public setPlayerStacks(msgs: string[]): void {
        this.player_stacks = getPlayerStacksMsg(pruneFlop(pruneStarting(msgs)));
    }

    public processPlayers() {
        for (let playerID of this.player_action.keys()) {
            let player = this.player_cache.get(playerID);
            let player_action = this.player_action.get(playerID);
            let player_stats = player?.getPlayerStats()
            if (player_action == 2) {
                player_stats ?.setVPIPHands(player_stats?.getVPIPHands() + 1)
                player_stats ?.setPFRHands(player_stats?.getPFRHands() + 1)
            } else if (player_action == 1) {
                player_stats?.setVPIPHands(player_stats?.getVPIPHands() + 1)
            }
            player_stats?.setTotalHands(player_stats?.getTotalHands() + 1)
            player?.updatePlayerStats(player_stats!)
            this.player_cache.set(playerID, player!)
        }
    }

    public async cacheFromLogs(logs: Array<Array<string>>): Promise<void> {
        for (let i = 0; i < logs.length; i++) {
            let msg = logs[i];
            if (msg.length > 3) {
                await this.cachePlayer(msg);
            }
        }
    }

    public popLogsQueue(): Array<string> | undefined{
        if (!(this.logs_queue.isEmpty())) {
            let res = this.logs_queue.dequeue()!;
            return res;
        }
        return undefined
    }

    public getPlayerAction(): Map<string, number> {
        return this.player_action;
    }

    public getPlayerActions(): Map<string, PlayerAction[]> {
        return this.getPlayerActions();
    }

    public updateOrCreatePlayerAction(player_id: string, player_action: PlayerAction): void {
        const actions = this.player_actions.get(player_id) ?? [];
        if (actions.length > 0) {
            actions.push(player_action);
        } else {
            actions.push(player_action);
            this.player_actions.set(player_id, actions);
        }
    }

    public getLogsQueue(): Queue<Array<string>> {
        return this.logs_queue;
    }

    public getPlayerCache(): Map<string, Player> {
        return this.player_cache;
    }

    // take in a list of players and cache all the players into player_cache if not exists already
    public async cachePlayer(msg: string[]): Promise<void> {
        const player_id = msg[0];
        const player_name = msg[1];

        if (!this.player_cache.has(player_id)) {
            const player_stats_str = await player_service.get(player_id);
            // if the player does not currently exist in the database, create a new player in db
            // otherwise retrieve the existing player from database,
            // then, add player to player_cache
            if (!player_stats_str) {
                const new_player_stats = new PlayerStats(player_id);
                await player_service.create(new_player_stats.toJSON());
                this.player_cache.set(player_id, new Player(player_name, new_player_stats));
            } else {
                const player_stats_JSON = JSON.parse(JSON.stringify(player_stats_str));
                this.player_cache.set(player_id, new Player(player_name, new PlayerStats(player_id, player_stats_JSON)));
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
        return "";
    }

    public convertDict() {
        for (let key of this.player_positions.keys()) {
            this.player_positions.set(key, this.convertPosition(this.player_positions.get(key), this.num_players));
        }
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

    public getAllInRunout(): boolean {
        return this.all_in_runout;
    }

    public setAllInRunout(all_in_runout: boolean): void {
        this.all_in_runout = all_in_runout;
    }

}