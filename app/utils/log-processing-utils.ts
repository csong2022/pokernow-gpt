export enum Action {
    BET = "bets",
    CALL = "calls",
    FOLD = "folds",
    RAISE = "raises",
    POST = "posts",
    CHECK = "checks",
}

export enum Street {
    PREFLOP = "Preflop",
    FLOP = "Flop",
    TURN = "Turn",
    RIVER = "River",
}

export interface LogsInfo {
    last_created: string,
    first_fetch: boolean
}

export function convertToBB(bet_amount: number, stakes: number): number {
    return bet_amount / stakes;
}

export function converToDollars(bet_amount: number, stakes: number): number {
    return bet_amount * stakes
}

export const letterToSuit: Map<string, string> = new Map<string, string>([
    ["s", "♠"],
    ["h", "♥"],
    ["d", "♦"],
    ["c", "♣"]
]);