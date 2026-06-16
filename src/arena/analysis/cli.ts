import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import path from 'path';

import { loadHandLogs } from './load.ts';
import { aggregateByModel, checkIntegrity } from './aggregate.ts';
import { computeStyleByModel } from './style.ts';
import { rankBradleyTerry } from './bradley-terry.ts';
import { AnalysisReport, BTRanking, IntegrityViolation, ModelSummary, StyleStats } from './types.ts';
import { byFormat, filterRuns, formatsIn, loadManifests } from './manifest-index.ts';
import type { RunFilter } from './manifest-index.ts';
import { writeManifest } from '../run-manifest.ts';
import type { RunFormat, RunManifest, RunResults } from '../run-manifest.ts';

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

// Decision-engine reliability per model: how often a reply needed a rethink
// re-prompt to parse, and how often the engine gave up and defaulted. Shown only
// when there's something to report.
function printDecisionEvents(models: ModelSummary[]): void {
    if (!models.some((s) => s.rethinkCount > 0 || s.fallbackCount > 0)) return;
    console.log('\nDecision reliability:');
    table(
        ['model', 'decisions', 'rethink', 'rethink%', 'fallback'],
        models.map((s) => [
            s.model,
            String(s.decisions),
            String(s.rethinkCount),
            fmt(s.decisions > 0 ? (s.rethinkCount / s.decisions) * 100 : 0, 1),
            String(s.fallbackCount),
        ]),
    );
}

// Bradley-Terry ranking (frequency) — shown next to bb/100 (margin) so agreement
// vs divergence between the two is visible.
function printBTTable(bt: BTRanking): void {
    console.log(`\nBradley-Terry ranking (pairwise win/loss by hand; ${bt.nComparisons} comparisons over ${bt.nDeals} ${bt.bootstrapUnit}s):`);
    table(
        ['model', 'BT rating', `95% CI (${bt.bootstrapUnit}-bootstrap)`, 'beta', 'W-L-D', 'n'],
        bt.models.map((m) => [
            m.model,
            fmt(m.rating, 0),
            m.ci95 ? `[${fmt(m.ci95.low, 0)}, ${fmt(m.ci95.high, 0)}]` : 'n/a',
            fmt(m.beta, 3),
            `${m.wins}-${m.losses}-${m.draws}`,
            String(m.nComparisons),
        ]),
    );
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

// Analyze one set of records: print the tables, write a JSON report, return the
// report + integrity violations. Shared by single-path mode and each per-format
// group in filter mode (which is why it never pools across formats — the caller
// partitions first).
function analyzeAndReport(records: ReturnType<typeof loadHandLogs>, source: string, reportPath: string): IntegrityViolation[] {
    const violations = checkIntegrity(records);
    const models = aggregateByModel(records);
    const style = computeStyleByModel(records);
    const bradleyTerry = rankBradleyTerry(records);

    const report: AnalysisReport = {
        generatedAt: new Date().toISOString(),
        source,
        handCount: records.length,
        models,
        style,
        bradleyTerry,
        integrity: { ok: violations.length === 0, violations },
    };

    console.log(`\nAnalyzed ${records.length} hands from ${source}\n`);
    printTable(models);
    printReducedTable(models);
    printBTTable(bradleyTerry);
    printStyleTable(style);
    printDecisionEvents(models);

    if (violations.length > 0) {
        console.error(`\n!!! INTEGRITY: ${violations.length} violation(s) — these findings are NOT trustworthy:`);
        for (const v of violations) console.error(`  [hand ${v.hand}] ${v.kind}: ${v.detail}`);
    } else {
        console.log('\nIntegrity: OK (chip conservation, seat->model, hand count, big_blind>0).');
    }

    mkdirSync(path.dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`Wrote machine-readable report -> ${reportPath}`);
    return violations;
}

// Resolve a source path to its run directory (the dir holding manifest.json), or
// null if the source isn't inside a run. Lets single-run analysis drop its report
// into the run dir (like manifest.json/hands.jsonl) instead of a flat side-dump.
function runDirOf(p: string): string | null {
    if (!existsSync(p)) return null;
    const dir = statSync(p).isDirectory() ? p : path.dirname(p);
    return existsSync(path.join(dir, 'manifest.json')) ? dir : null;
}

function resultsFrom(models: ModelSummary[]): RunResults {
    return {
        analyzedAt: new Date().toISOString(),
        models: models.map((m) => ({
            model: m.model,
            hands: m.hands,
            bbPer100: m.bbPer100,
            ci95HalfWidthBBPer100: m.ci95HalfWidthBBPer100,
            reducedHalfWidthBBPer100: m.reduced?.ci95HalfWidthBBPer100 ?? null,
            malformedRate: m.malformedRate,
        })),
    };
}

function getFlag(args: string[], flag: string): string | undefined {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
}

function main(): void {
    const args = process.argv.slice(2);
    const source = args.find((a) => !a.startsWith('--'));
    const outDir = getFlag(args, '--out') ?? 'arena-analysis';
    const runsRoot = getFlag(args, '--runs-root') ?? 'arena-runs';
    const filter: RunFilter = {
        format: getFlag(args, '--format') as RunFormat | undefined,
        model: getFlag(args, '--model'),
        tag: getFlag(args, '--tag'),
    };
    const hasFilter = Boolean(filter.format || filter.model || filter.tag);

    // Single-path mode: analyze a JSONL file or a directory of them. A run's report
    // lands inside its run dir (arena-runs/<id>/analysis.json); anything else goes
    // to the flat outDir.
    if (source && !hasFilter) {
        const runDir = runDirOf(source);
        const reportPath = runDir ? path.join(runDir, 'analysis.json') : path.join(outDir, `analysis-${Date.now()}.json`);
        const records = loadHandLogs(source);
        const violations = analyzeAndReport(records, source, reportPath);
        // When the source is a run, --write-results also backfills its manifest with
        // its own summary results (no pooling, no flat side-report).
        if (runDir && args.includes('--write-results')) {
            const manifest = JSON.parse(readFileSync(path.join(runDir, 'manifest.json'), 'utf8')) as RunManifest;
            writeManifest(runDir, { ...manifest, results: resultsFrom(aggregateByModel(records)) });
            console.log(`Backfilled results -> ${path.basename(runDir)}/manifest.json`);
        }
        process.exit(violations.length > 0 ? 1 : 0);
    }

    if (!hasFilter) {
        console.error('usage: analyze <jsonl-file-or-dir> [--out <dir>]');
        console.error('   or: analyze --format HU|3max|6max | --tag <tag> | --model <id> [--runs-root <dir>] [--write-results]');
        process.exit(2);
    }

    // Filter mode: resolve runs via the manifest index.
    const runs = filterRuns(loadManifests(runsRoot), filter);
    if (runs.length === 0) {
        console.error(`No runs in ${runsRoot} match filter ${JSON.stringify(filter)}.`);
        process.exit(2);
    }

    // Never pool incompatible formats: partition and analyze each separately.
    const formats = formatsIn(runs);
    if (formats.length > 1) {
        console.log(`Selection spans ${formats.length} formats (${formats.join(', ')}) — analyzing each separately; HU and 3max bb/100 are NOT pooled.`);
    }
    let anyViolation = false;
    for (const f of formats) {
        const group = byFormat(runs, f);
        console.log(`\n===== format ${f}: ${group.length} run(s) =====`);
        for (const r of group) console.log(`  - ${r.manifest.runId}`);
        const records = group.flatMap((r) => loadHandLogs(r.handsPath));
        // A single-run group writes into that run's dir; a multi-run group is a
        // cross-run report with no single home, so it goes to the flat outDir.
        const reportPath = group.length === 1
            ? path.join(group[0].dir, 'analysis.json')
            : path.join(outDir, `analysis-${f}-${Date.now()}.json`);
        const violations = analyzeAndReport(records, `filter ${JSON.stringify(filter)} [${f}]`, reportPath);
        if (violations.length > 0) anyViolation = true;
    }

    // Optionally backfill each selected run's manifest with its OWN results (each run
    // analyzed independently, so the manifest stays self-describing).
    if (args.includes('--write-results')) {
        for (const r of runs) {
            const models = aggregateByModel(loadHandLogs(r.handsPath));
            writeManifest(r.dir, { ...r.manifest, results: resultsFrom(models) });
            console.log(`Backfilled results -> ${r.manifest.runId}/manifest.json`);
        }
    }

    process.exit(anyViolation ? 1 : 0);
}

main();
