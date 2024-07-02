import { Player } from "./player.ts"
import { PlayerAction } from "./player-action.ts";
import { PlayerStats } from "./player-stats.ts";

import { PlayerService } from "../services/player-service.ts";

import { Queue } from "../utils/data-structures.ts"
import { getPlayerStacksMsg, getIdToInitialStackFromMsg as getPlayerInitialStacksFromMsg } from "../utils/message-processing-utils.ts";

export class Table {
    private player_service: PlayerService;

    private num_players: number;
    private players_in_pot: number;
    private pot_size_in_BBs: number;
    private runout: string;
    private street: string;

    private logs_queue: Queue<Array<string>>;
    private player_actions: Array<PlayerAction>;
    
    private id_to_action_num: Map<string, number>;
    private id_to_initial_stacks: Map<string, number>;
    private id_to_position: Map<string, string>;
    private id_to_table_seat: Map<string, number>;
    private table_seat_to_id: Map<number, string>;

    private id_to_name: Map<string, string>;
    private name_to_id: Map<string, string>;
    private name_to_player: Map<string, Player>;

    private first_seat_order_id: string;
    

    constructor(player_service: PlayerService) {
        this.player_service = player_service;

        this.num_players = 0;
        this.players_in_pot = 0;
        this.pot_size_in_BBs = 0;
        this.runout = "";
        this.street = "";

        this.logs_queue = new Queue();
        this.player_actions = new Array<PlayerAction>;
        
        this.id_to_action_num = new Map<string, number>();
        this.id_to_initial_stacks = new Map<string, number>();
        this.id_to_position = new Map<string, string>();
        this.id_to_table_seat = new Map<string, number>();
        this.table_seat_to_id = new Map<number, string>();
        
        this.id_to_name = new Map<string, string>();
        this.name_to_id = new Map<string, string>();
        this.name_to_player = new Map<string, Player>();
        
        this.first_seat_order_id = "";
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
        return this.pot_size_in_BBs;
    }
    public setPot(pot: number): void {
        this.pot_size_in_BBs = pot;
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
    public updateLogsQueue(log: string[]): void {
        this.logs_queue.enqueue(log);
    }
    public popLogsQueue(): Array<string> | undefined {
        if (!(this.logs_queue.isEmpty())) {
            let res = this.logs_queue.dequeue()!;
            return res;
        }
        return undefined;
    }

    public getPlayerActions(): Array<PlayerAction> {
        return this.player_actions;
    }
    public updatePlayerActions(player_action: PlayerAction): void {
        this.player_actions.push(player_action);
    }
    public resetPlayerActions(): void {
        this.player_actions = new Array<PlayerAction>();
    }

    public getIdToActionNum(): Map<string, number> {
        return this.id_to_action_num;
    }
    public getActionNumFromId(player_id: string): number {
        const action_num = this.id_to_action_num.get(player_id);
        if (action_num !== undefined) {
            return action_num;
        }
        throw new Error(`Could not retrieve action_num for player with id ${player_id}`);
    }
    public updateIdToActionNum(player_id: string, action_num: number): void {
        this.id_to_action_num.set(player_id, action_num);
    }
    public existsInIdToActionNum(player_id: string): boolean {
        return this.id_to_action_num.has(player_id);
    }
    public async processPlayers() {
        for (const player_id of this.id_to_action_num.keys()) {
            const player_name = this.getNameFromId(player_id);
            const player = this.name_to_player.get(player_name);
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
                    await this.player_service.update(player_name, player_stats.toJSON());
                } else {
                    throw new Error("Player stats is undefined.");
                }
            } else {
                throw new Error("Player is undefined.");
            }
        }
    }

    public getPlayerInitialStacks(): Map<string, number> {
        return this.id_to_initial_stacks;
    }
    public getPlayerInitialStackFromId(player_id: string): number {
        const player_stack_in_BBs = this.id_to_initial_stacks.get(player_id);
        if (player_stack_in_BBs !== undefined) {
            return player_stack_in_BBs;
        }
        throw new Error(`Could not retrieve stack for player with id: ${player_id}.`);
    }
    public setIdToStack(map: Map<string, number>): void {
        this.id_to_initial_stacks = map;
    }
    public setPlayerInitialStacksFromMsg(msgs: string[], stakes: number): void {
        this.id_to_initial_stacks = getPlayerInitialStacksFromMsg(getPlayerStacksMsg(msgs), stakes);
    }

    public getPlayerPositions(): Map<string, string> {
        return this.id_to_position;
    }
    public getPlayerPositionFromId(player_id: string): string {
        const player_position = this.id_to_position.get(player_id);
        if (player_position !== undefined) {
            return player_position;
        }
        throw new Error(`Could not retrieve position for player with id: ${player_id}.`);
    }
    
    public setIdToPosition(first_seat = 1): void {
        const visited = new Set<number>();
        let i = first_seat;
        let order = 0;
        const player_positions = Array.from(this.table_seat_to_id.keys());
        while (!(visited.has(i))) {
            visited.add(i)
            if (player_positions.includes(i)) {
                order += 1;
                const id = this.table_seat_to_id.get(i)!;
                this.id_to_position.set(id, order.toString());
            }
            i += 1;
            if (i > 10) {
                i = 1;
            }
        }
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

    public getSeatNumberFromId(player_id: string): number {
        const seat_number = this.id_to_table_seat.get(player_id);
        if (seat_number !== undefined) {
            return seat_number
        }
        throw new Error(`Could not retrieve seat number for player with id: ${player_id}.`)
    }
    public setIdToTableSeat(map: Map<string, number>): void {
        this.id_to_table_seat = map;
    }

    public getSeatNumberToId(): Map<number, string> {
        return this.table_seat_to_id;
    }
    public setTableSeatToId(map: Map<number, string>): void {
        this.table_seat_to_id = map;
    }

    public getNameFromId(player_id: string): string {
        const player_name = this.id_to_name.get(player_id);
        if (player_name !== undefined) {
            return player_name;
        }
        throw new Error(`Could not retrieve name for player with id: ${player_id}.`)
    }
    public setIdToName(map: Map<string, string>): void {
        this.id_to_name = map;
    }

    public getIdFromName(player_name: string): string {
        const player_id = this.name_to_id.get(player_name);
        if (player_id !== undefined) {
            return player_id;
        }
        throw new Error(`Could not retrieve id for player with name: ${player_name}.`)
    }
    public setNameToId(map: Map<string, string>): void {
        this.name_to_id = map;
    }

    public getPlayerCache(): Map<string, Player> {
        return this.name_to_player;
    }
    public getPlayerStatsFromName(player_name: string): PlayerStats {
        const player = this.name_to_player.get(player_name);
        if (player !== undefined) {
            return player.getPlayerStats();
        }
        throw new Error(`Could not retrieve player stats for player with name: ${player_name}.`);
    }
    public async updateCache(): Promise<void> {
        for (const name of this.name_to_id.keys()) {
            const id = this.name_to_id.get(name)!
            await this.cachePlayer(name, id);
        }
    }
    public async cachePlayer(player_name: string, player_id: string): Promise<void> {
        if (!this.name_to_player.has(player_name)) {
            const player_stats_str = await this.player_service.get(player_name);
            // if the player does not currently exist in the database, create a new player in db
            // otherwise retrieve the existing player from database,
            // then, add player to player_cache
            if (!player_stats_str) {
                const new_player_stats = new PlayerStats(player_name);
                await this.player_service.create(new_player_stats.toJSON());
                this.name_to_player.set(player_name, new Player(player_id, new_player_stats));
            } else {
                const player_stats_JSON = JSON.parse(JSON.stringify(player_stats_str));
                this.name_to_player.set(player_name, new Player(player_id, new PlayerStats(player_name, player_stats_JSON)));
            }
        }
    }

    public getFirstSeatOrderId(): string {
        return this.first_seat_order_id;
    }
    public setFirstSeatOrderId(first_seat_order_id: string): void {
        this.first_seat_order_id = first_seat_order_id;
    }

    public nextHand(): void {
        this.num_players = 0;
        this.players_in_pot = 0;
        this.pot_size_in_BBs = 0;
        this.runout = "";
        this.street = "";

        this.logs_queue = new Queue<string[]>();
        this.player_actions = new Array<PlayerAction>();

        this.id_to_action_num = new Map<string, number>();
        this.id_to_position = new Map<string, string>();
        this.id_to_initial_stacks = new Map<string, number>();
    }
}