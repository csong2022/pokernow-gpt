// Wire types for the PokerKit oracle (engine-py/server.py). Cards arrive in
// PokerKit short form ("Th", "Ah"); chip amounts are raw (engine truth). The
// state-mapper owns conversion to the core model (BB units, "10h" rank format).

export interface LegalActions {
    fold: boolean;
    check_call: boolean;
    check_call_amount: number;
    raise: boolean;
    min: number | null;
    max: number | null;
}

export interface PotView {
    amount: number;
    seats: number[];
}

export interface ActionEntry {
    seat: number;
    type: string; // core Action string: bets/raises/calls/checks/folds
    amount: number; // raw chips
    street_index: number;
}

export interface StateView {
    game_id: string;
    status: boolean;
    hand_over: boolean;
    street_index: number | null;
    actor_index: number | null;
    player_count: number;
    button: number | null;
    sb_index: number | null;
    bb_index: number | null;
    small_blind: number;
    big_blind: number;
    stacks: number[];
    bets: number[];
    board: string[];
    hole_cards: string[][];
    starting_stacks: number[];
    pots: PotView[];
    total_pot: number;
    legal_actions: LegalActions | null;
    actions: ActionEntry[];
}

export interface ShowdownResult {
    winners: number[];
    payouts: Record<string, number>;
    final_stacks: number[];
    hand_record: Record<string, unknown>;
}

// What the TS side asks the engine to do (mirrors PokerKit's three decisions).
export type EngineAction =
    | { action: 'fold' }
    | { action: 'check_call' }
    | { action: 'raise'; amount: number };

export interface TableConfig {
    blinds: [number, number];
    min_bet: number;
    starting_stacks: number | number[];
    player_count: number;
    mode?: 'cash' | 'tournament';
}
