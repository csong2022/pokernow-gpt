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
    private stack_size: number;

    constructor(name: string, player_data: PlayerStats, hand: string[], stack_size: number) {
        super(name, player_data);
        this.hand = hand;
        this.stack_size = stack_size;
    }

    public getHand(): string[] {
        return this.hand;
    }

    public setHand(hand: string[]): void {
        this.hand = hand;
    }

    public getStackSize(): number {
        return this.stack_size;
    }
    public setStackSize(stack_size: number): void {
        this.stack_size = stack_size;
    }
}