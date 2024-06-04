import { Hand } from "./hand"
import { PlayerData } from "./player-data";

export class Player {
    private name: string;
    private stack_size: number;
    private seat: number;
    private player_data: PlayerData;

    constructor(name: string, initial_stack_size: number, seat: number, player_data: PlayerData) {
        this.name = name;
        this.stack_size = initial_stack_size;
        this.seat = seat;
        this.player_data = player_data;
    }

    public getName(): string {
        return this.name;
    }

    public getStackSize(): number {
        return this.stack_size;
    }

    public setStackSize(stack_size: number): void {
        this.stack_size = stack_size;
    }

    public getSeat(): number {
        return this.seat;
    }

    public getPlayerData(): PlayerData {
        return this.player_data;
    }

    public updatePlayerData(id: string, total_hands?: number) {
        if (total_hands) {
            this.player_data.setTotalHands(total_hands);
        }
    }
}

export class Hero extends Player {
    private hand: Hand;

    constructor(name: string, initial_stack_size: number, seat: number, player_data: PlayerData) {
        super(name, initial_stack_size, seat, player_data);
        this.hand = new Hand();
    }

    public getHand(): Hand {
        return this.hand;
    }

    public setHand(hand: Hand): void {
        this.hand = hand;
    }
}