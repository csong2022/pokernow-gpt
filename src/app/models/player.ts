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
    private hand: string[];
    constructor(name: string, player_data: PlayerStats, hand: string[]) {
        super(name, player_data);
        this.hand = hand;
    }

    public getHand(): string[] {
        return this.hand;
    }

    public setHand(hand: string[]): void {
        this.hand = hand;
    }
}