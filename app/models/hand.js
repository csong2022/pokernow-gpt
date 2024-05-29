class Hand {
    constructor() {
        this.cards = [];
    }

    getFirstCard() {
        if (this.cards.length == 0) {
            throw new Error('Hand is currently empty!');
        }
        return this.cards[0];
    }

    getSecondCard() {
        if (this.cards.length == 0) {
            throw new Error('Hand is currently empty!');
        }
        return this.cards[1];
    }
    
    toString() {
        return this.getFirstCard().toString() + " " + this.getSecondCard().toString();
    }
}