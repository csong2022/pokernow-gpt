// Mulberry32 PRNG so bootstrap results are reproducible when a seed is given.
// Falls back to Math.random when seed is null.
export function makeRng(seed: number | null): () => number {
    if (seed === null) return Math.random;
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function mean(xs: number[]): number {
    if (xs.length === 0) return 0;
    let s = 0;
    for (const x of xs) s += x;
    return s / xs.length;
}

export function stdDev(xs: number[]): number {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    let s2 = 0;
    for (const x of xs) s2 += (x - m) * (x - m);
    return Math.sqrt(s2 / (xs.length - 1));
}

export function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return NaN;
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export interface BootstrapResult {
    point: number;
    ci_lo: number;
    ci_hi: number;
}

// Standard nonparametric bootstrap on the mean of a single sample, scaled by `scale`.
// For BB/100 in poker, pass scale = 100 and pass per-hand stack deltas (in BB) as values.
export function bootstrapMean(
    values: number[],
    B: number,
    rng: () => number,
    scale: number = 1,
): BootstrapResult {
    const n = values.length;
    const point = mean(values) * scale;
    if (n < 2) return { point, ci_lo: NaN, ci_hi: NaN };

    const replicates: number[] = new Array(B);
    for (let b = 0; b < B; b++) {
        let s = 0;
        for (let i = 0; i < n; i++) {
            s += values[Math.floor(rng() * n)];
        }
        replicates[b] = (s / n) * scale;
    }
    replicates.sort((x, y) => x - y);
    return { point, ci_lo: percentile(replicates, 0.025), ci_hi: percentile(replicates, 0.975) };
}

// Paired-cluster bootstrap on the mean difference. Resamples shared indices once
// per replicate so within-cluster correlation between A and B is preserved.
// For poker pairwise comparison: a[i], b[i] are the two models' stack deltas in
// the same hand i, restricted to hands both models played.
export function bootstrapPairedDiff(
    a: number[],
    b: number[],
    B: number,
    rng: () => number,
    scale: number = 1,
): BootstrapResult & { replicates?: number[] } {
    if (a.length !== b.length) throw new Error("paired arrays must be same length");
    const n = a.length;
    const point = (mean(a) - mean(b)) * scale;
    if (n < 2) return { point, ci_lo: NaN, ci_hi: NaN };

    const replicates: number[] = new Array(B);
    for (let bi = 0; bi < B; bi++) {
        let sa = 0;
        let sb = 0;
        for (let i = 0; i < n; i++) {
            const j = Math.floor(rng() * n);
            sa += a[j];
            sb += b[j];
        }
        replicates[bi] = ((sa - sb) / n) * scale;
    }
    replicates.sort((x, y) => x - y);
    return {
        point,
        ci_lo: percentile(replicates, 0.025),
        ci_hi: percentile(replicates, 0.975),
        replicates,
    };
}
