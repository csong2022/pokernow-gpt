import {Hand} from "./hand"

export class Player {
    private name: string;
    private stack_size: number;
    private position: string;

    constructor(name: string, initial_stack_size: number, position: string) {
        this.name = name;
        this.stack_size = initial_stack_size;
        this.position = position;
    }

    public getStackSize(): number {
        return this.stack_size;
    }
}

export class Hero extends Player {
    private hand: Hand;

    constructor(name: string, initial_stack_size: number, position: string) {
        super(name, initial_stack_size, position);
        this.hand = new Hand();
    }
}