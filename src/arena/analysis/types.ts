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

// A decision-engine event for one decision: "rethink" (a re-prompt was needed to
// get a parseable Final Answer) or "fallback" (the engine gave up and defaulted).
export interface DecisionEventEntry {
    seat: number;
    kind: string;
}

// One engine action from the hand's ordered action list. Vocabulary matches the
// core Action enum (`bets|calls|folds|raises|checks`); blinds are not emitted.
export interface ActionEntry {
    type: string;
    amount: number;
    seat: number;
    street_index: number; // 0 = preflop
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
    decision_events?: DecisionEventEntry[]; // rethink/fallback per decision (absent in older logs)

    // Ordered engine action list for the hand. Present in real logs; optional so
    // older logs without it don't crash (style stats are skipped for those).
    actions?: ActionEntry[];

    // duplicate-deck harness tags (absent in plain runs); analysis groups by deal_id
    deal_id?: number;
    rotation?: number;

    // present in real logs but unused by analysis
    game_id?: string;
    config?: Record<string, unknown>;
    small_blind?: number;
}

// Variance statistics over a set of per-observation bb results.
export interface VarianceStats {
    n: number;
    bbPer100: number;
    mbbPerHand: number;
    stddevBBPerHand: number;
    standardError: number;
    ci95BBPer100: { low: number; high: number } | null; // null when n < 2
    ci95HalfWidthBBPer100: number | null;
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
    rethinkCount: number;     // decisions needing a rethink re-prompt to parse
    fallbackCount: number;    // decisions where the engine gave up and defaulted

    // Variance-reduced estimate (duplicate-deck runs only). Same point estimate
    // as the raw bb/100 but with a tighter CI, since per-deal card luck cancels.
    // `deals` is the reduced sample size (n). Undefined for plain runs.
    reduced?: VarianceStats & { deals: number };
}

// Per-model behavioral style stats, computed offline from the ordered action list.
// Keyed by model identity (modelIdOf), summed across seats. Percentages use
// hands-dealt as the denominator (NB: not live's walk-adjusted denominator).
// These are over RAW per-hand rows and are NOT independent across duplicate-deck
// replays (the same situation is replayed up to P! times) — fine for behavioral
// frequencies, but stated explicitly so they're not read as edge estimates.
export interface StyleStats {
    model: string;
    hands: number;              // (model, hand) rows the model was dealt into
    vpipPct: number;            // voluntarily put money in preflop
    pfrPct: number;             // raised preflop
    threeBetPct: number;        // three_bet_hands / three_bet_opportunities
    foldToThreeBetPct: number;  // folded_to_three_bet / faced_three_bet
    afqPct: number;             // (bets+raises)/(bets+raises+calls+folds), all streets
    // raw counts behind the percentages, for transparency / re-derivation
    vpipHands: number;
    pfrHands: number;
    threeBetOpportunities: number;
    threeBetHands: number;
    facedThreeBet: number;
    foldedToThreeBet: number;
    bets: number;
    raises: number;
    calls: number;
    folds: number;
}

export interface IntegrityViolation {
    hand: number; // -1 for log-level issues
    kind: string;
    detail: string;
}

// Bradley-Terry ranking (frequency statistic) — see bradley-terry.ts.
export interface BTModel {
    model: string;
    rating: number;                              // Elo-scaled (1000 + 400/ln10 * beta)
    beta: number;                                // raw centered strength
    ci95: { low: number; high: number } | null;  // Elo-scaled deal-level bootstrap CI
    wins: number;
    losses: number;
    draws: number;
    nComparisons: number;                        // pairwise comparisons involving this model
}

export interface BTRanking {
    models: BTModel[];                  // sorted by rating desc
    nComparisons: number;
    nDeals: number;
    bootstrapUnit: 'deal' | 'hand';     // 'hand' only for plain runs without deal_id
}

export interface AnalysisReport {
    generatedAt: string;
    source: string;
    handCount: number;
    models: ModelSummary[];
    style: StyleStats[];
    bradleyTerry: BTRanking;       // frequency-based ranking, alongside bb/100 (margin)
    integrity: { ok: boolean; violations: IntegrityViolation[] };
}
