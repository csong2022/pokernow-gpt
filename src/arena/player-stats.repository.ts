import { PlayerStatsRepository } from '../core/player/playerstats-repository.interface.ts';

// Minimal in-memory implementation of the core port so the arena can satisfy
// DecisionEngine/Table without dragging in services/db. For Milestone 1 stats
// are effectively empty (no opponent modeling yet); a hand-by-hand stats
// pipeline can replace this later.
//
// Note: Table.cachePlayer deep-clones whatever get() returns and feeds it to
// `new PlayerStats(name, row)`, so — like the live DB service — get() returns
// the stored stats object (or "" when absent), not a JSON string. The port
// types it as string; we mirror the live service's looser runtime behavior.
export class InMemoryPlayerStatsRepository implements PlayerStatsRepository {
    private readonly rows = new Map<string, any>();

    async get(player_name: string): Promise<string> {
        return (this.rows.get(player_name) ?? '') as unknown as string;
    }

    async create(player_stats_JSON: any): Promise<void> {
        this.rows.set(player_stats_JSON.name, player_stats_JSON);
    }

    updateMany(updates: Array<{ player_name: string; player_stats_JSON: any }>): void {
        for (const { player_name, player_stats_JSON } of updates) {
            this.rows.set(player_name, player_stats_JSON);
        }
    }
}
