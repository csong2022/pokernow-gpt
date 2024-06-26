import { Hero } from "./player.ts";
import { Player } from "./player.ts";
import { Table } from "./table.ts";

export class Game {
    private game_id: string;
    private stakes: number;
    private game_type: string;
    private players: Map<string, Player>;
    private hero?: Hero;
    private table: Table;

    constructor(game_id: string, stakes: number, game_type: string) {
        this.game_id = game_id;
        this.stakes = stakes;
        this.game_type = game_type;
        this.players = new Map<string, Player>();
        this.hero = undefined;
        this.table = new Table();
    }

    public getGameId(): string {
        return this.game_id;
    }

    public getStakes(): number {
        return this.stakes;
    }

    public getGameType(): string {
        return this.game_type;
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

    public getTable(): Table {
        return this.table;
    }
}