import {Hand} from "./hand.js"
class Player {
    constructor(name, initial_stack_size, position, hand) {
        this.name = name;
        this.stack_size = initial_stack_size;
        this.position = position;
    }

    getStackSize() {
        return this.stack_size;
    }
}

class Hero extends Player {
    constructor() {
        super();
        this.hand = new Hand();
    }
}