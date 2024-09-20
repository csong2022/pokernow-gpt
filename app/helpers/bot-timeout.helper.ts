export function computeTimeout(num_players: number, max_turn_length: number, num_streets: number): number {
    return 1000 * (num_players - 1) * max_turn_length * num_streets;
}
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}