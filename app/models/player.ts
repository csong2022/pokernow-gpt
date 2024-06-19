import { PlayerStats } from "./player-stats.ts";

export class Player {
    private name: string;
    private player_stats: PlayerStats;

    constructor(name: string, player_data: PlayerStats) {
        this.name = name;
        this.player_stats = player_data;
    }

    public getName(): string {
        return this.name;
    }

    public getPlayerData(): PlayerStats {
        return this.player_stats;
    }

    public updatePlayerData(id: string, total_hands?: number): void {
        if (total_hands) {
            this.player_stats.setTotalHands(total_hands);
        }
    }
}

export class Hero extends Player {
    constructor(name: string, player_data: PlayerStats) {
        super(name, player_data);
    }
}