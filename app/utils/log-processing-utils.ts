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

export interface Data {
    logs: Array<Log>
}

export interface Log {
    at: string,
    created_at: string,
    msg: string
}

export interface ProcessedLogs {
    valid_msgs: Array<Array<string>>,
    last_created: string,
    first_fetch: boolean
}

export const letterToSuit: Map<string, string> = new Map<string, string>([
    ["s", "♠"],
    ["h", "♥"],
    ["d", "♦"],
    ["c", "♣"]
]);