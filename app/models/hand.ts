import { Card } from "./card.ts";

export class Hand {
    private cards: Array<Card>;

    constructor(card1?: Card, card2?: Card) {
        this.cards = [];
        if (card1) {
            this.cards.push(card1);
        }
        if (card2) {
            this.cards.push(card2);
        }
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