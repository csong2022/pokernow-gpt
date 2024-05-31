import {Card} from "./card";

export class Hand {
    private cards: Array<Card>;

    constructor() {
        this.cards = [];
    }

    public getFirstCard(): Card {
        if (this.cards.length == 0) {
            throw new Error('Hand is currently empty!');
        }
        return this.cards[0];
    }

    public getSecondCard(): Card {
        if (this.cards.length == 0) {
            throw new Error('Hand is currently empty!');
        }
        return this.cards[1];
    }
    
    public toString(): string {
        return `${this.getFirstCard().toString()} ${this.getSecondCard().toString()}`;
    }
}