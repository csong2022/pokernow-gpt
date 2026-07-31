// Deck generation for the duplicate-deck harness. A deck is the concatenated
// short-form 52-card string the engine consumes (ten = "T"); the engine deals
// holes, burns, and board from it in order, so the same string => the same hand.

const RANKS = '23456789TJQKA';
const SUITS = 'cdhs';

export function fullDeck(): string[] {
    const cards: string[] = [];
    for (const r of RANKS) for (const s of SUITS) cards.push(r + s);
    return cards;
}

// Mulberry32 — a tiny seedable PRNG so runs/tests can be reproduced.
export function seededRng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Fisher–Yates shuffle of a full 52-card deck -> concatenated string.
export function generateDeck(rng: () => number = Math.random): string {
    const cards = fullDeck();
    for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards.join('');
}
