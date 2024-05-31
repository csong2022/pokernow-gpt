export class Card {
    private value: string;
    private suit: string;

    constructor(value: string, suit: string) {
        this.value = value;
        this.suit = suit;
    }

    public getValue(): string {
        return this.value;
    }

    public getSuit(): string {
        return this.suit;
    }
    
    public toString(): string {
        return `${this.value}${this.suit}`;
    }
}