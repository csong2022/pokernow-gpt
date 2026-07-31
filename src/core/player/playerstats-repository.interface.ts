// Port (core-owned) for persisting/reading player stats. Core depends on this
// interface, not on any concrete DB service, so the storage backend lives in an
// adapter (e.g. src/services/db) and is injected in. Keep it to what the domain
// actually needs.

export interface PlayerStatsRepository {
    get(player_name: string): Promise<string>;
    create(player_stats_JSON: any): Promise<void>;
    updateMany(updates: Array<{ player_name: string, player_stats_JSON: any }>): void;
}
