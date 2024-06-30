import { Hero } from "./player.ts";
import { Player } from "./player.ts";
import { PlayerStats } from "./player-stats.ts";
import { Table } from "./table.ts";

export class Game {
    private game_id: string;
    private big_blind: number;
    private small_blind: number;
    private game_type: string;
    private max_turn_length: number;
    private players: Map<string, Player>;
    private hero?: Hero;
    private table: Table;

    constructor(game_id: string, big_blind: number, small_blind: number, game_type: string, max_turn_length: number) {
        this.game_id = game_id;
        this.big_blind = big_blind;
        this.small_blind = small_blind;
        this.game_type = game_type;
        this.max_turn_length = max_turn_length;
        this.players = new Map<string, Player>();
        this.hero = undefined;
        this.table = new Table();
    }

    public getGameId(): string {
        return this.game_id;
    }

    public getBigBlind(): number {
        return this.big_blind;
    }

    public getSmallBlind(): number {
        return this.small_blind;
    }

    public getGameType(): string {
        return this.game_type;
    }
    
    public getMaxTurnLength(): number {
        return this.max_turn_length;
    }
    
    public getPlayers(): Map<string, Player> {
        return this.players;
    }

    public getHero(): Hero | undefined {
        return this.hero;
    }

    public setHero(hero: Hero): void {
        this.hero = hero;
    }

    public createAndSetHero(bot_name: string, hand: string[], stack_size: number): void {
        this.setHero(new Hero(bot_name, new PlayerStats(this.table.getIDFromName(bot_name)), hand, stack_size));
    }

    public getTable(): Table {
        return this.table;
    }
}