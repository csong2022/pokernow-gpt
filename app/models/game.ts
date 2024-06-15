import { Player } from "./player.ts"

export class Game {
    private game_id: string;
    private stakes: number;
    private game_type: string;
    private players: Map<string, Player>;

    constructor(game_id: string, stakes: number, game_type: string) {
        this.game_id = game_id;
        this.stakes = stakes;
        this.game_type = game_type;
        this.players = new Map<string, Player>();
    }

    public getGameId() {
        return this.game_id;
    }

    public getStakes() {
        return this.stakes;
    }

    public getGameType() {
        return this.game_type;
    }
    
    public getPlayers() {
        return this.players;
    }
}