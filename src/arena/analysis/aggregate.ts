import { HandRecord, IntegrityViolation, ModelSummary, VarianceStats } from './types.ts';

const Z_95 = 1.96;                 // normal quantile for a 95% CI
const CONSERVATION_EPS = 1e-6;     // chips are integers; allow tiny float slack

// Model identity = agent name with the "#<seat>" suffix stripped, so aggregation
// is by model (rotation-safe) rather than by seat. NB: a mirror match (same model
// in both seats) merges into one row — correct for a per-model win rate.
export function modelIdOf(agent: string): string {
    return agent.replace(/#\d+$/, '');
}

function push(map: Map<string, number[]>, key: string, value: number): void {
    const arr = map.get(key);
    if (arr) arr.push(value);
    else map.set(key, [value]);
}

// Mean / sample stddev / SE / 95% CI (in bb/100) over a set of per-observation
// bb-per-hand values. CI is null when n < 2 (sample stddev undefined).
export function summarize(results: number[]): VarianceStats {
    const n = results.length;
    const mean = n > 0 ? results.reduce((a, b) => a + b, 0) / n : 0;
    let stddev = 0;
    let standardError = 0;
    let ci95BBPer100: { low: number; high: number } | null = null;
    let halfWidth: number | null = null;
    if (n >= 2) {
        const variance = results.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
        stddev = Math.sqrt(variance);
        standardError = stddev / Math.sqrt(n);
        halfWidth = Z_95 * standardError * 100;
        ci95BBPer100 = { low: mean * 100 - halfWidth, high: mean * 100 + halfWidth };
    }
    return {
        n,
        bbPer100: mean * 100,
        mbbPerHand: mean * 1000,
        stddevBBPerHand: stddev,
        standardError,
        ci95BBPer100,
        ci95HalfWidthBBPer100: halfWidth,
    };
}

// Per-hand bb result for each model: chip_delta / big_blind_of_that_hand.
export function perHandModelResults(records: HandRecord[]): Map<string, number[]> {
    const byModel = new Map<string, number[]>();
    for (const rec of records) {
        for (let seat = 0; seat < rec.agents.length; seat++) {
            push(byModel, modelIdOf(rec.agents[seat]), rec.deltas[seat] / rec.big_blind);
        }
    }
    return byModel;
}

// Variance-reduced per-deal results: group hands by deal_id; within a deal, each
// model's observation is its MEAN bb/hand across that deal's hands (the full
// rotation), so card luck cancels. One observation per (model, deal).
export function perDealModelResults(records: HandRecord[]): Map<string, number[]> {
    const deals = new Map<number, HandRecord[]>();
    for (const rec of records) {
        if (rec.deal_id == null) continue;
        const arr = deals.get(rec.deal_id);
        if (arr) arr.push(rec);
        else deals.set(rec.deal_id, [rec]);
    }
    const byModel = new Map<string, number[]>();
    for (const recs of deals.values()) {
        const sum = new Map<string, { total: number; count: number }>();
        for (const rec of recs) {
            for (let seat = 0; seat < rec.agents.length; seat++) {
                const model = modelIdOf(rec.agents[seat]);
                const e = sum.get(model) ?? { total: 0, count: 0 };
                e.total += rec.deltas[seat] / rec.big_blind;
                e.count += 1;
                sum.set(model, e);
            }
        }
        for (const [model, { total, count }] of sum) push(byModel, model, total / count);
    }
    return byModel;
}

export function hasDuplicateData(records: HandRecord[]): boolean {
    return records.some((r) => r.deal_id != null);
}

export function aggregateByModel(records: HandRecord[]): ModelSummary[] {
    const handResults = perHandModelResults(records);
    const dealResults = hasDuplicateData(records) ? perDealModelResults(records) : null;
    const decisions = new Map<string, number>();
    const malformed = new Map<string, number>();
    const rethink = new Map<string, number>();
    const fallback = new Map<string, number>();
    const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

    for (const rec of records) {
        for (const ra of rec.resolved_actions ?? []) {
            const agent = rec.agents[ra.seat];
            if (agent != null) bump(decisions, modelIdOf(agent));
        }
        for (const ev of rec.malformed_events ?? []) {
            const agent = rec.agents[ev.seat];
            if (agent != null) bump(malformed, modelIdOf(agent));
        }
        for (const ev of rec.decision_events ?? []) {
            const agent = rec.agents[ev.seat];
            if (agent == null) continue;
            if (ev.kind === 'rethink') bump(rethink, modelIdOf(agent));
            else if (ev.kind === 'fallback') bump(fallback, modelIdOf(agent));
        }
    }

    const summaries: ModelSummary[] = [];
    for (const [model, results] of handResults) {
        const raw = summarize(results);
        const dec = decisions.get(model) ?? 0;
        const mal = malformed.get(model) ?? 0;
        const summary: ModelSummary = {
            model,
            hands: raw.n,
            decisions: dec,
            netBB: results.reduce((a, b) => a + b, 0),
            meanBBPerHand: raw.bbPer100 / 100,
            bbPer100: raw.bbPer100,
            mbbPerHand: raw.mbbPerHand,
            stddevBBPerHand: raw.stddevBBPerHand,
            standardError: raw.standardError,
            ci95BBPer100: raw.ci95BBPer100,
            ci95HalfWidthBBPer100: raw.ci95HalfWidthBBPer100,
            malformedCount: mal,
            malformedRate: dec > 0 ? mal / dec : 0,
            rethinkCount: rethink.get(model) ?? 0,
            fallbackCount: fallback.get(model) ?? 0,
        };
        if (dealResults) {
            const red = summarize(dealResults.get(model) ?? []);
            summary.reduced = { ...red, deals: red.n };
        }
        summaries.push(summary);
    }

    summaries.sort((a, b) => b.bbPer100 - a.bbPer100);
    return summaries;
}

// Integrity guards. Corrupt logs produce garbage win rates, so these are meant to
// be surfaced loudly by the caller, never silently ignored.
export function checkIntegrity(records: HandRecord[]): IntegrityViolation[] {
    const violations: IntegrityViolation[] = [];
    if (records.length === 0) {
        violations.push({ hand: -1, kind: 'no-hands', detail: 'log contains 0 hands' });
        return violations;
    }
    for (const rec of records) {
        const agents = rec.agents ?? [];
        const deltas = rec.deltas ?? [];

        if (agents.length !== deltas.length) {
            violations.push({
                hand: rec.hand,
                kind: 'seat-mismatch',
                detail: `agents=${agents.length} but deltas=${deltas.length}`,
            });
        } else {
            for (let seat = 0; seat < agents.length; seat++) {
                if (!agents[seat]) {
                    violations.push({ hand: rec.hand, kind: 'unknown-model', detail: `seat ${seat} has no agent identity` });
                }
            }
        }

        const sum = deltas.reduce((a, b) => a + b, 0);
        if (Math.abs(sum) > CONSERVATION_EPS) {
            violations.push({ hand: rec.hand, kind: 'chip-conservation', detail: `sum(deltas)=${sum} (expected 0)` });
        }

        if (!(rec.big_blind > 0)) {
            violations.push({ hand: rec.hand, kind: 'bad-big-blind', detail: `big_blind=${rec.big_blind}` });
        }
    }
    return violations;
}
