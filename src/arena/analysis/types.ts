// Types for the offline analysis pass over the arena's JSONL hand logs.
// Pure data — no engine, no live, no play-loop coupling.

export interface MalformedEvent {
    seat: number;
    desired?: unknown;
    resolved?: unknown;
    reason?: string;
}

export interface ResolvedActionEntry {
    seat: number;
    desired?: unknown;
    engineAction?: unknown;
}

// One line of a hand log. Only the fields the analysis reads are required; the
// rest of the record (hole_cards, board, winners, …) is ignored here.
export interface HandRecord {
    hand: number;
    agents: string[];      // index = seat; e.g. "OpenAI:gpt-5.4-nano#0"
    deltas: number[];      // index = seat; per-seat chip result (final - starting)
    big_blind: number;     // chips; read PER HAND, never hardcoded
    malformed_events: MalformedEvent[];
    resolved_actions: ResolvedActionEntry[];

    // present in real logs but unused by analysis
    game_id?: string;
    config?: Record<string, unknown>;
    small_blind?: number;
}

export interface ModelSummary {
    model: string;            // model identity (agent name with #seat stripped)
    hands: number;            // hands the model played
    decisions: number;        // resolved actions taken (malformed-rate denominator)
    netBB: number;            // total bb won/lost
    meanBBPerHand: number;
    bbPer100: number;         // mean_bb_per_hand * 100
    mbbPerHand: number;       // mean_bb_per_hand * 1000 (paper comparability)
    stddevBBPerHand: number;  // sample stddev (n-1)
    standardError: number;    // stddev / sqrt(n)
    ci95BBPer100: { low: number; high: number } | null; // null when n < 2
    ci95HalfWidthBBPer100: number | null;               // 1.96 * SE * 100
    malformedCount: number;
    malformedRate: number;    // malformed / decisions (0 when no decisions)
}

export interface IntegrityViolation {
    hand: number; // -1 for log-level issues
    kind: string;
    detail: string;
}

export interface AnalysisReport {
    generatedAt: string;
    source: string;
    handCount: number;
    models: ModelSummary[];
    integrity: { ok: boolean; violations: IntegrityViolation[] };
}
