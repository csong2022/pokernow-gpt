import { Hand } from "./hand"
import { PlayerData } from "./player-data";

export class Player {
    private name: string;
    private stack_size: number;
    private seat: number;

    constructor(name: string, initial_stack_size: number, seat: number) {
        this.name = name;
        this.stack_size = initial_stack_size;
        this.seat = seat;
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
}

export class Hero extends Player {
    private hand: Hand;

    constructor(name: string, initial_stack_size: number, seat: number) {
        super(name, initial_stack_size, seat);
        this.hand = new Hand();
    }

    public getHand(): Hand {
        return this.hand;
    }

    public setHand(hand: Hand): void{
        this.hand = hand;
    }
}