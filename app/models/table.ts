import * as player_service from "../services/player-service.ts"
import { Action } from "../utils/log-processing-utils.ts";
import { Player } from "./player.ts"
import { PlayerAction } from "./player-action.ts";
import { PlayerStats } from "./player-stats.ts";
import { Queue } from "../utils/data-structures.ts"
import { pruneFlop, getPlayerStacksMsg, getPlayerStacksFromMsg as getPlayerInitialStacksFromMsg } from "../services/message-service.ts";
import { Street, convertToBBs } from "../utils/log-processing-utils.ts";
import { Game } from "./game.ts";

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
    private id_to_initial_stacks: Map<string, number>;
    private name_to_id: Map<string, string>;
    private table_seat_to_id: Map<number, string>;
    private first_seat_order_id: string;
    private id_to_table_seat: Map<string, number>;

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
        this.id_to_initial_stacks = new Map<string, number>();
        this.name_to_id = new Map<string, string>();
        this.table_seat_to_id = new Map<number, string>();
        this.first_seat_order_id = "";
        this.id_to_table_seat = new Map<string, number>();
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
    public preProcessLogs(logs: Array<Array<string>>, stakes: number) {
        logs = logs.reverse();
        logs.forEach((element) => {
            if (element[2] === 'posts' && element[4] === stakes.toString()) {
                this.first_seat_order_id = element[0]
            }
            this.logs_queue.enqueue(element);
        })
    }

    public getFirstSeatOrderId(): string {
        return this.first_seat_order_id;
    }

    public setTableSeatToId(map: Map<number, string>): void {
        this.table_seat_to_id = map;
    }

    public setIdToTableSeat(map: Map<string, number>): void {
        this.id_to_table_seat = map;
    }


    public setIdToStack(map: Map<string, number>): void {
        this.id_to_initial_stacks = map;
    }

    public setNameToId(map: Map<string, string>): void {
        this.name_to_id = map;
    }

    public setIdToPosition(first_seat = 1): void {
        let visited = new Set<number>();
        let i = first_seat
        let order = 0
        const player_positions = Array.from(this.table_seat_to_id.keys());
        while (!(visited.has(i))) {
            visited.add(i)
            if (player_positions.includes(i)) {
                order += 1
                let id = this.table_seat_to_id.get(i)!
                this.id_to_position.set(id, order.toString())
            }
            i += 1
            if (i >= 11) {
                i = 1
            }
        }
    }

    public async postProcessLogs(logs_queue: Queue<Array<string>>, game: Game) {
        const table = game.getTable();
        while (!logs_queue.isEmpty()) {
            const log = logs_queue.dequeue();
            //process player action
            if (log != null) {
                if (!Object.values<string>(Street).includes(log[0])) {
                    const player_id = log[0];
                    const player_name = log[1];
                    const action = log[2];
                    const bet_size = log[4];
                    if (action === "folds") {
                        table.decrementPlayersInPot();
                    }
                    let player_action = new PlayerAction(player_id, action, convertToBBs(Number(bet_size), game.getStakes()));
                    table.updatePlayerActions(player_action);
                    await table.cachePlayer(player_id, player_name);
                } else {
                    const street = log[0];
                    const runout = log[1];
                    table.setStreet(street.toLowerCase());
                    table.setRunout(runout);
                }
            }
        }
    }

    public getPlayerActions(): Array<PlayerAction> {
        return this.player_actions;
    }
    public updatePlayerActions(player_action: PlayerAction): void {
        this.player_actions.push(player_action);
    }
    public getSeatNumberToId(): Map<number, string> {
        return this.table_seat_to_id
    }
    public getIdToSeatNumber(): Map<string, number> {
        return this.id_to_table_seat
    }

    public getActionNumFromId(): Map<string, number> {
        return this.id_to_action_num;
    }

    // TODO: this needs to take in the blinds or else total_hands isn't updated correctly
    public async postProcessLogsAfterHand(logs: Array<Array<string>>) {
        // 0 means they didn't put in money, 1 means they put in money but didn't raise (CALL)
        // 2 means they put in money through a raise. 1 -> vpip, 2 -> vpip & pfr
        // higher numbers override lower numbers
        let action_count = 0;
        for (const log of logs) {
            if (log.length > 3) {
                const player_id = log[0];
                const player_name = log[1];
                const action = log[2];
                let actionNum = 0;
                await this.cachePlayer(player_id,  player_name);
                if (action === Action.CALL) {
                    actionNum = 1;
                    action_count += 1;
                } else if (action === Action.BET || action === Action.RAISE) {
                    actionNum = 2;
                    action_count += 1;
                }
                if (!this.id_to_action_num.has(player_id) || this.id_to_action_num.get(player_id)! < actionNum) {
                    this.id_to_action_num.set(player_id, actionNum);
                }
            }
        }
        if (action_count == 0) {
            const player_ids_arr = Array.from(this.id_to_action_num.keys());
            player_ids_arr.forEach(player_id => {
                const player_stats = this.getPlayerStatsFromId(player_id);
                player_stats.incrementWalks();
            })
        }
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
                    // ßthis.id_to_player.set(player_id, player);
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
    public getPlayerPositionFromID(player_id: string): string {
        const player_position = this.id_to_position.get(player_id);
        if (player_position) {
            return player_position;
        }
        throw new Error(`Could not retrieve position for player with id: ${player_id}.`);
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

    public getPlayerInitialStacks(): Map<string, number> {
        return this.id_to_initial_stacks;
    }
    public getPlayerInitialStackFromID(player_id: string): number {
        const player_stack_in_BBs = this.id_to_initial_stacks.get(player_id);
        if (player_stack_in_BBs) {
            return player_stack_in_BBs;
        }
        throw new Error(`Could not retrieve stack for player with id: ${player_id}.`);
    }
    public setPlayerInitialStacksFromMsg(msgs: string[], stakes: number): void {
        this.id_to_initial_stacks = getPlayerInitialStacksFromMsg(getPlayerStacksMsg(msgs), stakes);
    }

    public getIDFromName(name: string): string {
        const player_id = this.name_to_id.get(name);
        if (player_id) {
            return player_id;
        }
        throw new Error(`Could not retrieve id for player with name: ${name}.`)
    }

    public resetPlayerActions(): void {
        this.player_actions = new Array<PlayerAction>();
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
        this.id_to_initial_stacks = new Map<string, number>();
    }
}