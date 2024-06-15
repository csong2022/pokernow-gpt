import { Dictionary } from "../utils/data-structures.ts";
import { Player } from "./player.ts"

export class Game {
    private game_id: string;
    private stakes: number;
    private players: Map<string, Player>;

    constructor(game_id: string, stakes: number) {
        this.game_id = game_id;
        this.stakes = stakes;
        this.players = new Map<string, Player>();
    }

    public getGameId() {
        return this.game_id;
    }

    public getStakes() {
        return this.stakes;
    }
}