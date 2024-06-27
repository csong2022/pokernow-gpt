export function computeTimeout(num_players: number, max_turn_length: number, num_streets: number): number {
    return 1000 * (num_players - 1) * max_turn_length * num_streets;
}

export interface GameInfo {
    game_type: string,
    stakes: number
}