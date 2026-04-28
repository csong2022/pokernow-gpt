// Compares per-hand stack deltas across AI models with a clustered nonparametric
// bootstrap. Reads from HandOutcomes (populated by GameStateBuilder.endHand) in
// the same SQLite database the bot writes to.
//
// Usage:
//   npx tsx scripts/analyze-models.ts
//   npx tsx scripts/analyze-models.ts --db ./pokernow-gpt.db --B 10000 --json out.json --seed 42

import fs from 'node:fs';

import { DBService } from '../src/services/db/db.service.ts';
import { HandOutcomesAPIService, HandOutcome } from '../src/services/db/handoutcomes.service.ts';
import {
    BootstrapResult,
    bootstrapMean,
    bootstrapPairedDiff,
    makeRng,
    percentile,
    stdDev,
} from '../src/utils/bootstrap.util.ts';

interface CliArgs {
    db: string;
    B: number;
    seed: number | null;
    json: string | null;
}

function parseArgs(argv: string[]): CliArgs {
    const args: CliArgs = { db: './pokernow-gpt.db', B: 10000, seed: null, json: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--db') args.db = argv[++i];
        else if (a === '--B') args.B = parseInt(argv[++i]);
        else if (a === '--seed') args.seed = parseInt(argv[++i]);
        else if (a === '--json') args.json = argv[++i];
    }
    return args;
}

function modelKey(o: HandOutcome): string {
    return `${o.model_provider}/${o.model_name}`;
}

// One row per (model, hand): sum of stack_delta_BB across any rows of that model in that hand.
function buildModelHandOutcomes(rows: HandOutcome[]): Map<string, Map<string, number>> {
    const out = new Map<string, Map<string, number>>();
    for (const r of rows) {
        const m = modelKey(r);
        if (!out.has(m)) out.set(m, new Map());
        const inner = out.get(m)!;
        inner.set(r.hand_id, (inner.get(r.hand_id) ?? 0) + r.stack_delta_BB);
    }
    return out;
}

function fmt(x: number): string {
    if (!Number.isFinite(x)) return "NaN";
    return x.toFixed(2);
}

function pad(s: string, n: number): string {
    return s.length >= n ? s : s + " ".repeat(n - s.length);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const rng = makeRng(args.seed);

    const db = new DBService(args.db);
    db.init();
    // Idempotent — ensures HandOutcomes exists on a DB that pre-dates the new schema.
    db.createTables();
    const api = new HandOutcomesAPIService(db);

    const rows = await api.getAll();
    if (rows.length === 0) {
        console.log(`No rows in HandOutcomes at ${args.db}.`);
        db.close();
        return;
    }
    console.log(`Loaded ${rows.length} hand outcome rows from ${args.db}.`);

    const modelOutcomes = buildModelHandOutcomes(rows);
    const models = [...modelOutcomes.keys()].sort();

    // ---- Per-model BB/100 ----
    console.log("\nPer-model winrate (BB/100), 95% bootstrap CI on hands the model played:");
    console.log(pad("Model", 40) + pad("Hands", 10) + pad("BB/100", 12) + pad("95% CI", 28) + pad("σ/hand", 10));
    console.log("-".repeat(100));

    const perModel: Record<string, { hands: number; bb100: BootstrapResult; sd: number }> = {};
    for (const m of models) {
        const inner = modelOutcomes.get(m)!;
        const values = [...inner.values()];
        const res = bootstrapMean(values, args.B, rng, 100);
        const sd = stdDev(values);
        perModel[m] = { hands: values.length, bb100: res, sd };
        console.log(
            pad(m, 40) +
            pad(String(values.length), 10) +
            pad(fmt(res.point), 12) +
            pad(`[${fmt(res.ci_lo)}, ${fmt(res.ci_hi)}]`, 28) +
            pad(fmt(sd), 10),
        );
    }

    // ---- Pairwise diff with paired-cluster bootstrap on shared hands ----
    const k = models.length;
    const numPairs = (k * (k - 1)) / 2;
    const bonf = numPairs > 0 ? 0.05 / numPairs : 0.05;
    const halfBonf = bonf / 2;

    console.log("\nPairwise ΔBB/100 (A − B) on hands BOTH models played, 95% CI:");
    console.log(`(Bonferroni-adjusted significance flag: '*' if 0 outside ${(1 - bonf).toFixed(3)} CI after ${numPairs} comparisons.)`);
    console.log(pad("Model A", 36) + pad("Model B", 36) + pad("Shared", 8) + pad("ΔBB/100", 12) + pad("95% CI", 28) + "sig");
    console.log("-".repeat(125));

    const pairwise: Array<{ a: string; b: string; shared: number; diff: BootstrapResult; significant: boolean }> = [];
    for (let i = 0; i < models.length; i++) {
        for (let j = i + 1; j < models.length; j++) {
            const a = models[i];
            const b = models[j];
            const innerA = modelOutcomes.get(a)!;
            const innerB = modelOutcomes.get(b)!;
            const sharedHands = [...innerA.keys()].filter(h => innerB.has(h));
            if (sharedHands.length === 0) continue;
            const va = sharedHands.map(h => innerA.get(h)!);
            const vb = sharedHands.map(h => innerB.get(h)!);

            const res = bootstrapPairedDiff(va, vb, args.B, rng, 100);
            const replicates = res.replicates!;
            const lo_b = percentile(replicates, halfBonf);
            const hi_b = percentile(replicates, 1 - halfBonf);
            const significant = (lo_b > 0) || (hi_b < 0);

            pairwise.push({ a, b, shared: sharedHands.length, diff: res, significant });
            console.log(
                pad(a, 36) +
                pad(b, 36) +
                pad(String(sharedHands.length), 8) +
                pad(fmt(res.point), 12) +
                pad(`[${fmt(res.ci_lo)}, ${fmt(res.ci_hi)}]`, 28) +
                (significant ? "*" : ""),
            );
        }
    }
    if (args.json) {
        fs.writeFileSync(args.json, JSON.stringify({ args, perModel, pairwise }, null, 2));
        console.log(`\nWrote JSON results to ${args.json}.`);
    }

    db.close();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
