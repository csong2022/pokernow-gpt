export function convertToBBs(bet_amount: number, stakes: number): number {
    return bet_amount / stakes;
}

export function convertToValue(bet_amount: number, stakes: number): number {
    return Math.floor(bet_amount * stakes);
}