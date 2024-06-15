import { PlayerData } from "./player-data.ts";

export class Player {
    private name: string;
    private player_data: PlayerData;

    constructor(name: string, player_data: PlayerData) {
        this.name = name;
        this.player_data = player_data;
    }

    public getName(): string {
        return this.name;
    }

    public getPlayerData(): PlayerData {
        return this.player_data;
    }

    public updatePlayerData(id: string, total_hands?: number): void {
        if (total_hands) {
            this.player_data.setTotalHands(total_hands);
        }
    }
}

export class Hero extends Player {
    constructor(name: string, player_data: PlayerData) {
        super(name, player_data);
    }
}