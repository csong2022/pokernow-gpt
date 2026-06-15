import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

import { loadHandLogs } from './load.ts';
import { aggregateByModel, checkIntegrity } from './aggregate.ts';
import { AnalysisReport, ModelSummary } from './types.ts';

function fmt(n: number, digits = 2): string {
    return Number.isFinite(n) ? n.toFixed(digits) : 'n/a';
}

function ciText(s: ModelSummary): string {
    if (!s.ci95BBPer100) return 'n/a (n<2)';
    return `[${fmt(s.ci95BBPer100.low)}, ${fmt(s.ci95BBPer100.high)}]`;
}

function printTable(models: ModelSummary[]): void {
    const rows = models.map((s) => [
        s.model,
        String(s.hands),
        fmt(s.bbPer100),
        fmt(s.mbbPerHand, 1),
        ciText(s),
        fmt(s.netBB),
        `${fmt(s.malformedRate * 100)}% (${s.malformedCount}/${s.decisions})`,
    ]);
    const header = ['model', 'hands', 'bb/100', 'mbb/hand', '95% CI (bb/100)', 'net bb', 'malformed'];
    const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
    const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
    console.log(line(header));
    console.log(widths.map((w) => '-'.repeat(w)).join('  '));
    for (const r of rows) console.log(line(r));
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

    const report: AnalysisReport = {
        generatedAt: new Date().toISOString(),
        source,
        handCount: records.length,
        models,
        integrity: { ok: violations.length === 0, violations },
    };

    console.log(`\nAnalyzed ${records.length} hands from ${source}\n`);
    printTable(models);

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
