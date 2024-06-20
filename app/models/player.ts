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

    public getPlayerStats(): PlayerStats {
        return this.player_stats;
    }

    public updatePlayerStats(player_data: PlayerStats): void {
        this.player_stats = player_data;
    }
}

export class Hero extends Player {
    constructor(name: string, player_data: PlayerStats) {
        super(name, player_data);
    }
}