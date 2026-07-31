import type { BTModel, BTRanking, HandRecord } from './types.ts';
import { modelIdOf } from './aggregate.ts';

// Bradley-Terry ranking over per-hand pairwise win/loss/draw outcomes — the
// Kaggle-comparable FREQUENCY statistic, reported ALONGSIDE bb/100 (the margin
// statistic). Pure/offline: HandRecord in, ratings out; no engine, no live.
//
// Reduction unit = the HAND. Per hand we group chip deltas by modelIdOf (a model
// in two seats contributes the SUM of its seats), then compare every distinct
// pair of models: higher total delta beats lower, equal = draw. A 3-max hand
// yields 3 pairwise outcomes; these intra-hand outcomes are NOT independent
// (kingmaking) — independence is handled by bootstrapping at the DEAL level, not
// in the reduction. HU and 3-max are never pooled (the caller fits per format).

export interface PairwiseOutcome {
    a: string;       // model id (canonical: a < b by string)
    b: string;
    sa: number;      // score for a: 1 win, 0 loss, 0.5 draw
}

const ELO_SCALE = 400 / Math.LN10;
const toElo = (beta: number): number => 1000 + ELO_SCALE * beta;

// Per-hand model -> summed chip delta (sums a model's seats; index = seat).
function modelDeltas(rec: HandRecord): Map<string, number> {
    const totals = new Map<string, number>();
    for (let seat = 0; seat < rec.agents.length; seat++) {
        const model = modelIdOf(rec.agents[seat]);
        totals.set(model, (totals.get(model) ?? 0) + (rec.deltas[seat] ?? 0));
    }
    return totals;
}

// All distinct-pair outcomes for the given hands. A model vs itself never arises
// (deltas are grouped by model first, so each model appears once per hand).
export function pairwiseOutcomes(records: HandRecord[]): PairwiseOutcome[] {
    const out: PairwiseOutcome[] = [];
    for (const rec of records) {
        const totals = [...modelDeltas(rec).entries()];
        for (let i = 0; i < totals.length; i++) {
            for (let j = i + 1; j < totals.length; j++) {
                let [a, da] = totals[i];
                let [b, db] = totals[j];
                if (a > b) { [a, b] = [b, a]; [da, db] = [db, da]; } // canonical a < b
                const sa = da > db ? 1 : da < db ? 0 : 0.5;
                out.push({ a, b, sa });
            }
        }
    }
    return out;
}

export interface FitOptions {
    iters?: number;
    lr?: number;
    l2?: number;
    tol?: number;
}

// MLE Bradley-Terry by gradient ascent on the mean log-likelihood with a small L2
// penalty (keeps betas finite under separation), centered to mean 0 each step.
export function fitBT(models: string[], outcomes: PairwiseOutcome[], opts: FitOptions = {}): Map<string, number> {
    const { iters = 2000, lr = 2, l2 = 1e-3, tol = 1e-8 } = opts;
    const idx = new Map(models.map((m, i) => [m, i]));
    const beta = new Array(models.length).fill(0);
    const n = Math.max(1, outcomes.length);

    for (let it = 0; it < iters; it++) {
        const grad = new Array(models.length).fill(0);
        for (const o of outcomes) {
            const a = idx.get(o.a)!;
            const b = idx.get(o.b)!;
            const p = 1 / (1 + Math.exp(-(beta[a] - beta[b]))); // P(a beats b)
            const g = o.sa - p;
            grad[a] += g;
            grad[b] -= g;
        }
        let maxg = 0;
        for (let k = 0; k < beta.length; k++) {
            const g = grad[k] / n - l2 * beta[k];
            beta[k] += lr * g;
            if (Math.abs(g) > maxg) maxg = Math.abs(g);
        }
        const mean = beta.reduce((s, x) => s + x, 0) / beta.length;
        for (let k = 0; k < beta.length; k++) beta[k] -= mean;
        if (maxg < tol) break;
    }
    return new Map(models.map((m, i) => [m, beta[i]]));
}

function distinctModels(records: HandRecord[]): string[] {
    const set = new Set<string>();
    for (const rec of records) for (const a of rec.agents) set.add(modelIdOf(a));
    return [...set].sort();
}

// Group hand indices by deal_id; each hand is its own group when deal_id is absent
// (plain runs) — the bootstrap then resamples hands, which the report notes.
function dealGroups(records: HandRecord[]): { groups: number[][]; unit: 'deal' | 'hand' } {
    const hasDeals = records.some((r) => r.deal_id != null);
    if (!hasDeals) return { groups: records.map((_, i) => [i]), unit: 'hand' };
    const byDeal = new Map<number, number[]>();
    records.forEach((r, i) => {
        const key = r.deal_id!;
        if (!byDeal.has(key)) byDeal.set(key, []);
        byDeal.get(key)!.push(i);
    });
    return { groups: [...byDeal.values()], unit: 'deal' };
}

// Mulberry32 — small seedable PRNG so bootstrap CIs are reproducible in tests.
function mulberry32(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export interface BootstrapOptions {
    iters?: number;
    rng?: () => number;
    unit?: 'deal' | 'hand'; // override the resampling unit (tests); default = auto from deal_id
    fit?: FitOptions;
}

// Bootstrap Elo ratings per model by resampling the INDEPENDENT unit (deals) with
// replacement and refitting BT each time. Returns 2.5/97.5 percentile Elo bounds.
export function bootstrapRatings(
    records: HandRecord[],
    models: string[],
    opts: BootstrapOptions = {},
): { unit: 'deal' | 'hand'; ci: Map<string, { low: number; high: number }> } {
    const { iters = 1000, rng = Math.random, fit } = opts;
    const auto = dealGroups(records);
    const unit = opts.unit ?? auto.unit;
    const groups = unit === 'hand' ? records.map((_, i) => [i]) : auto.groups;

    const samples = new Map<string, number[]>(models.map((m) => [m, []]));
    for (let it = 0; it < iters; it++) {
        const picked: HandRecord[] = [];
        for (let g = 0; g < groups.length; g++) {
            const grp = groups[Math.floor(rng() * groups.length)];
            for (const idx of grp) picked.push(records[idx]);
        }
        const betas = fitBT(models, pairwiseOutcomes(picked), fit);
        for (const m of models) samples.get(m)!.push(toElo(betas.get(m)!));
    }

    const ci = new Map<string, { low: number; high: number }>();
    for (const m of models) {
        const arr = samples.get(m)!.sort((x, y) => x - y);
        ci.set(m, { low: percentile(arr, 2.5), high: percentile(arr, 97.5) });
    }
    return { unit, ci };
}

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return NaN;
    const rank = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(rank);
    const hi = Math.ceil(rank);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (rank - lo) * (sorted[hi] - sorted[lo]);
}

export interface RankOptions {
    bootstrap?: boolean;        // default true
    bootstrapIters?: number;
    rng?: () => number;
    seed?: number;
    fit?: FitOptions;
}

// Full BT ranking for one format's records: fit, tally W/L/D, bootstrap CIs.
export function rankBradleyTerry(records: HandRecord[], opts: RankOptions = {}): BTRanking {
    const models = distinctModels(records);
    const outcomes = pairwiseOutcomes(records);
    const betas = fitBT(models, outcomes, opts.fit);

    const rec = new Map(models.map((m) => [m, { wins: 0, losses: 0, draws: 0, n: 0 }]));
    for (const o of outcomes) {
        const A = rec.get(o.a)!;
        const B = rec.get(o.b)!;
        A.n++; B.n++;
        if (o.sa === 1) { A.wins++; B.losses++; }
        else if (o.sa === 0) { A.losses++; B.wins++; }
        else { A.draws++; B.draws++; }
    }

    const doBoot = opts.bootstrap !== false && models.length >= 2 && records.length > 0;
    const boot = doBoot
        ? bootstrapRatings(records, models, {
            iters: opts.bootstrapIters ?? 1000,
            rng: opts.rng ?? mulberry32(opts.seed ?? 1),
            fit: opts.fit,
        })
        : null;

    const { unit } = dealGroups(records);
    const btModels: BTModel[] = models.map((m) => {
        const r = rec.get(m)!;
        const beta = betas.get(m)!;
        return {
            model: m,
            rating: toElo(beta),
            beta,
            ci95: boot ? boot.ci.get(m)! : null,
            wins: r.wins,
            losses: r.losses,
            draws: r.draws,
            nComparisons: r.n,
        };
    }).sort((x, y) => y.rating - x.rating);

    const nDeals = unit === 'deal' ? new Set(records.map((r) => r.deal_id)).size : records.length;
    return { models: btModels, nComparisons: outcomes.length, nDeals, bootstrapUnit: boot?.unit ?? unit };
}
