import * as player_service from "../services/player-service.ts"
import { Action } from "../utils/log-processing-utils.ts";
import { Player } from "./player.ts"
import { PlayerAction } from "./player-action.ts";
import { PlayerStats } from "./player-stats.ts";
import { Queue } from "../utils/data-structures.ts"
import { pruneFlop, pruneStarting, getPlayerStacksFromMsg } from "../services/message-service.ts";
import { Street } from "../utils/log-processing-utils.ts";

export class Table {
    private num_players: number;
    private players_in_pot: number;
    private pot: number;
    private runout: string;
    private street: string;

    private logs_queue: Queue<Array<string>>;
    private player_actions: Array<PlayerAction>;
    
    private id_to_action_num: Map<string, number>;
    private id_to_player: Map<string, Player>;
    private id_to_position: Map<string, string>;
    private id_to_stacks: Map<string, number>;
    private name_to_id: Map<string, string>;

    constructor() {
        this.num_players = 0;
        this.players_in_pot = 0;
        this.pot = 0;
        this.runout = "";
        this.street = "";

        this.logs_queue = new Queue();
        this.player_actions = new Array<PlayerAction>;
        
        this.id_to_action_num = new Map<string, number>();
        this.id_to_player = new Map<string, Player>();
        this.id_to_position = new Map<string, string>();
        this.id_to_stacks = new Map<string, number>();
        this.name_to_id = new Map<string, string>();
    }

    public getNumPlayers(): number {
        return this.num_players;
    }
    public setNumPlayers(num_players: number): void {
        this.num_players = num_players;
    }

    public getPlayersInPot(): number {
        return this.players_in_pot;
    }
    public setPlayersInPot(players_in_pot: number): void {
        this.players_in_pot = players_in_pot;
    }
    public decrementPlayersInPot(): void {
        this.players_in_pot -= 1;
    } 

    public getPot(): number {
        return this.pot;
    }
    public setPot(pot: number): void {
        this.pot = pot;
    }


    public getRunout(): string {
        return this.runout;
    }
    public setRunout(runout: string): void {
        this.runout = runout;
    }


    public getStreet(): string {
        return this.street;
    }
    public setStreet(street: string): void {
        this.street = street;
    }


    public getLogsQueue(): Queue<Array<string>> {
        return this.logs_queue;
    }
    public popLogsQueue(): Array<string> | undefined{
        if (!(this.logs_queue.isEmpty())) {
            let res = this.logs_queue.dequeue()!;
            return res;
        }
        return undefined;
    }
    public preProcessLogs(logs: Array<Array<string>>) {
        logs = logs.reverse();
        let order = 0;
        logs.forEach((element) => {
            if (!(Object.values<string>(Street).includes(element[0]))) {
                if (!(this.id_to_position.has(element[0]))) {
                    order += 1;
                    this.id_to_position.set(element[0], order.toString())
                }
                if (!(this.name_to_id.has(element[1]))) {
                    this.name_to_id.set(element[1], element[0])
                }

            }
            this.logs_queue.enqueue(element);
        })
    }

    public getPlayerActions(): Array<PlayerAction> {
        return this.player_actions;
    }
    public updatePlayerActions(player_action: PlayerAction): void {
        this.player_actions.push(player_action);
    }


    public getActionNumFromId(): Map<string, number> {
        return this.id_to_action_num;
    }
    public classifyAction(logs: Array<Array<string>>) {
        // 0 means they didn't put in money, 1 means they put in money but didn't raise (CALL)
        // 2 means they put in money through a raise. 1 -> vpip, 2 -> vpip & pfr
        // higher numbers override lower numbers
        logs.forEach((log_data) => {
            if (log_data.length > 3) {
                let id = log_data[0];
                let action = log_data[2];
                let actionNum = 0;
                if (action === Action.CALL) {
                    actionNum = 1;
                } else if (action === Action.BET || action === Action.RAISE) {
                    actionNum = 2;
                }
                if ((!(id in this.id_to_action_num)) || this.id_to_action_num.get(id)! < actionNum) {
                    this.id_to_action_num.set(id, actionNum);
                }
            }
        })
    }


    public getPlayerCache(): Map<string, Player> {
        return this.id_to_player;
    }

    public getPlayerStatsFromId(id: string): PlayerStats {
        const player = this.id_to_player.get(id);
        if (player) {
            return player.getPlayerStats();
        }
        throw new Error("Could not retrieve player stats.");
    }

    public async cachePlayer(player_id: string, player_name: string): Promise<void> {
        if (!this.id_to_player.has(player_id)) {
            const player_stats_str = await player_service.get(player_id);
            // if the player does not currently exist in the database, create a new player in db
            // otherwise retrieve the existing player from database,
            // then, add player to player_cache
            if (!player_stats_str) {
                const new_player_stats = new PlayerStats(player_id);
                await player_service.create(new_player_stats.toJSON());
                this.id_to_player.set(player_id, new Player(player_name, new_player_stats));
            } else {
                const player_stats_JSON = JSON.parse(JSON.stringify(player_stats_str));
                this.id_to_player.set(player_id, new Player(player_name, new PlayerStats(player_id, player_stats_JSON)));
            }
        }
    }
    public async cacheFromLogs(logs: Array<Array<string>>): Promise<void> {
        for (let i = 0; i < logs.length; i++) {
            let msg = logs[i];
            if (msg.length > 3) {
                await this.cachePlayer(msg[0], msg[1]);
            }
        }
    }
    public async processPlayers() {
        for (const player_id of this.id_to_action_num.keys()) {
            const player = this.id_to_player.get(player_id);
            const player_action = this.id_to_action_num.get(player_id);
            if (player) {
                const player_stats = player.getPlayerStats();
                if (player_stats) {
                    if (player_action == 2) {
                        player_stats.setVPIPHands(player_stats.getVPIPHands() + 1);
                        player_stats.setPFRHands(player_stats.getPFRHands() + 1);
                    } else if (player_action == 1) {
                        player_stats.setVPIPHands(player_stats.getVPIPHands() + 1);
                    }
                    player_stats.setTotalHands(player_stats.getTotalHands() + 1);
                    player.updatePlayerStats(player_stats);
                    // update player in-memory cache
                    this.id_to_player.set(player_id, player);
                    // update database
                    await player_service.update(player_id, player_stats.toJSON());
                } else {
                    throw new Error("Player stats is undefined.");
                }
            } else {
                throw new Error("Player is undefined.");
            }
        }
    }

    
    public getPlayerPositions(): Map<string, string> {
        return this.id_to_position;
    }
    public getPositionFromID(id: string): string {
        return this.id_to_position.get(id)!;
    }
    public convertAllOrdersToPosition() {
        for (let key of this.id_to_position.keys()) {
            this.id_to_position.set(key, this.convertOrderToPosition(this.id_to_position.get(key), this.num_players));
        }
    }
    public convertOrderToPosition(curr: string | undefined, total_players: number): string {
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

    public getPlayerStacks(): Map<string, number> {
        return this.id_to_stacks;
    }
    public setPlayerStacks(msgs: string[], stakes: number): void {
        this.id_to_stacks = getPlayerStacksFromMsg(msgs, stakes);
    }

    public getIDFromName(name: string): string {
        return this.name_to_id.get(name)!;
    }

    public nextHand(): void {
        this.num_players = 0;
        this.players_in_pot = 0;
        this.pot = 0;
        this.runout = "";
        this.street = "";

        this.logs_queue = new Queue<string[]>();
        this.player_actions = new Array<PlayerAction>();

        this.id_to_action_num = new Map<string, number>();
        this.id_to_position = new Map<string, string>();
        this.id_to_stacks = new Map<string, number>();
    }
}