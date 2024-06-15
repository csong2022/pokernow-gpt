export class Game {
    private game_id: string;
    private stakes: number;

    constructor(game_id: string, stakes: number) {
        this.game_id = game_id;
        this.stakes = stakes;
    }

    public getGameId() {
        return this.game_id;
    }

    public getStakes() {
        return this.stakes;
    }
}