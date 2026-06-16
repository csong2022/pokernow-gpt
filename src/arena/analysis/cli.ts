import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

import { loadHandLogs } from './load.ts';
import { aggregateByModel, checkIntegrity } from './aggregate.ts';
import { computeStyleByModel } from './style.ts';
import { AnalysisReport, ModelSummary, StyleStats } from './types.ts';

function fmt(n: number, digits = 2): string {
    return Number.isFinite(n) ? n.toFixed(digits) : 'n/a';
}

function ciText(ci: { low: number; high: number } | null): string {
    if (!ci) return 'n/a (n<2)';
    return `[${fmt(ci.low)}, ${fmt(ci.high)}]`;
}

function table(header: string[], rows: string[][]): void {
    const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
    const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
    console.log(line(header));
    console.log(widths.map((w) => '-'.repeat(w)).join('  '));
    for (const r of rows) console.log(line(r));
}

function printTable(models: ModelSummary[]): void {
    table(
        ['model', 'hands', 'bb/100', 'mbb/hand', '95% CI (bb/100)', 'net bb', 'malformed'],
        models.map((s) => [
            s.model,
            String(s.hands),
            fmt(s.bbPer100),
            fmt(s.mbbPerHand, 1),
            ciText(s.ci95BBPer100),
            fmt(s.netBB),
            `${fmt(s.malformedRate * 100)}% (${s.malformedCount}/${s.decisions})`,
        ]),
    );
}

// Per-model behavioral style — how each model played, not just who won. Raw
// per-hand frequencies (see caveat below).
function printStyleTable(style: StyleStats[]): void {
    if (style.length === 0) return;
    console.log('\nStyle (raw per-hand; preflop VPIP/PFR/3-Bet, AFq over all streets):');
    table(
        ['model', 'hands', 'VPIP%', 'PFR%', '3Bet%', 'F3Bet%', 'AFq%'],
        style.map((s) => [
            s.model,
            String(s.hands),
            fmt(s.vpipPct, 1),
            fmt(s.pfrPct, 1),
            fmt(s.threeBetPct, 1),
            fmt(s.foldToThreeBetPct, 1),
            fmt(s.afqPct, 1),
        ]),
    );
    console.log('  (style stats are over raw hands and may double-count duplicated situations across replays; AFq = (bets+raises)/(bets+raises+calls+folds))');
}

// Raw vs duplicate-deck-reduced CI, shown only for duplicate runs.
function printReducedTable(models: ModelSummary[]): void {
    const withReduced = models.filter((s) => s.reduced);
    if (withReduced.length === 0) return;
    console.log('\nVariance-reduced (duplicate-deck, grouped by deal):');
    table(
        ['model', 'deals', 'bb/100', 'raw +/- (bb/100)', 'reduced +/- (bb/100)', 'CI shrink'],
        withReduced.map((s) => {
            const rawHalf = s.ci95HalfWidthBBPer100;
            const redHalf = s.reduced!.ci95HalfWidthBBPer100;
            const shrink = rawHalf != null && redHalf != null && redHalf > 0 ? `${fmt(rawHalf / redHalf, 1)}x` : 'n/a';
            return [
                s.model,
                String(s.reduced!.deals),
                fmt(s.reduced!.bbPer100),
                rawHalf == null ? 'n/a' : fmt(rawHalf),
                redHalf == null ? 'n/a' : fmt(redHalf),
                shrink,
            ];
        }),
    );
}

function main(): void {
    const args = process.argv.slice(2);
    const source = args.find((a) => !a.startsWith('--'));
    if (!source) {
        console.error('usage: analyze <jsonl-file-or-dir> [--out <dir>]');
        process.exit(2);
    }
    const outIdx = args.indexOf('--out');
    const outDir = outIdx >= 0 ? args[outIdx + 1] : 'arena-analysis';

    const records = loadHandLogs(source);
    const violations = checkIntegrity(records);
    const models = aggregateByModel(records);
    const style = computeStyleByModel(records);

    const report: AnalysisReport = {
        generatedAt: new Date().toISOString(),
        source,
        handCount: records.length,
        models,
        style,
        integrity: { ok: violations.length === 0, violations },
    };

    console.log(`\nAnalyzed ${records.length} hands from ${source}\n`);
    printTable(models);
    printReducedTable(models);
    printStyleTable(style);

    if (violations.length > 0) {
        console.error(`\n!!! INTEGRITY: ${violations.length} violation(s) — these findings are NOT trustworthy:`);
        for (const v of violations) console.error(`  [hand ${v.hand}] ${v.kind}: ${v.detail}`);
    } else {
        console.log('\nIntegrity: OK (chip conservation, seat->model, hand count, big_blind>0).');
    }

    mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `analysis-${Date.now()}.json`);
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`\nWrote machine-readable report -> ${outPath}`);

    process.exit(violations.length > 0 ? 1 : 0);
}

main();
