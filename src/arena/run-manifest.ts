import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

// A run's identity lives in metadata (this manifest), not its filename. Each run is
// a directory: arena-runs/<run_id>/{manifest.json, hands.jsonl}. The manifest is
// small, versioned, and self-describing (it carries enough — format, models, deals,
// results — to answer "what did I run?" on a fresh checkout, even though the bulky
// hands.jsonl is gitignored).

export type RunFormat = 'HU' | '3max' | '6max';
export type RotationMode = 'full' | 'cyclic' | 'none'; // "none" = plain (non-duplicate) run

// Per-model results, backfilled by the analysis pass (null until analyzed). A small
// projection of the analyzer's ModelSummary — enough to read off a run's outcome
// without re-running analysis.
export interface RunResults {
    analyzedAt: string;
    models: Array<{
        model: string;
        hands: number;
        bbPer100: number;
        ci95HalfWidthBBPer100: number | null;
        reducedHalfWidthBBPer100?: number | null;
        malformedRate: number;
    }>;
}

export interface RunManifest {
    runId: string;
    createdAt: string;            // ISO
    gitCommit: string | null;     // short hash if available, else null
    format: RunFormat;
    models: string[];             // STABLE registry ids ([] for stub/calibration agents)
    rotation: RotationMode;
    deals: number | null;         // null for plain runs
    replaysPerDeal: number;       // 1 for plain runs
    tags: string[];
    notes: string;
    results?: RunResults | null;  // null until analyzed
}

export function formatOf(playerCount: number): RunFormat {
    switch (playerCount) {
        case 2: return 'HU';
        case 3: return '3max';
        case 6: return '6max';
        default: throw new Error(`no RunFormat for player_count=${playerCount} (expected 2, 3, or 6)`);
    }
}

// Compact, human-scannable token for a registry id: drop provider words, version
// numbers, and noise suffixes, keep the descriptive tail. gpt-5.4-mini -> "mini",
// claude-haiku-4-5 -> "haiku", gemini-3.1-flash-lite-preview -> "flashlite".
const SLUG_DROP = new Set(['gpt', 'claude', 'gemini', 'preview', 'latest', 'chat']);
export function shortModelId(id: string): string {
    const tokens = id.toLowerCase().split(/[-.]/).filter(
        (t) => t && !SLUG_DROP.has(t) && !/^\d+$/.test(t),
    );
    return tokens.join('') || id.replace(/[^a-z0-9]/gi, '');
}

// YYYYMMDDTHHMMZ — sortable + scannable.
export function utcStamp(d: Date): string {
    const p = (n: number): string => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}Z`;
}

// run_id = <UTC-timestamp>-<slug>. Slug = format + model short ids, or
// "<format>-stub" when there are no registry models.
export function makeRunId(createdAt: Date, format: RunFormat, models: string[]): string {
    const fmt = format.toLowerCase();
    const slug = models.length > 0 ? `${fmt}-${models.map(shortModelId).join('-')}` : `${fmt}-stub`;
    return `${utcStamp(createdAt)}-${slug}`;
}

// Best-effort short commit hash; null if not in a git repo / git unavailable.
export function currentGitCommit(): string | null {
    try {
        return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim() || null;
    } catch {
        return null;
    }
}

export interface StartedRun {
    runId: string;
    dir: string;
    handsPath: string;
    manifest: RunManifest;
}

// Create the run directory and write its manifest. Returns the path the caller
// should write hands.jsonl to. Does not touch the engine or hand data.
export function startRun(runsRoot: string, m: Omit<RunManifest, 'runId'> & { runId?: string }): StartedRun {
    const created = new Date(m.createdAt);
    const runId = m.runId ?? makeRunId(created, m.format, m.models);
    const dir = path.join(runsRoot, runId);
    mkdirSync(dir, { recursive: true });
    const manifest: RunManifest = { ...m, runId, results: m.results ?? null };
    writeManifest(dir, manifest);
    return { runId, dir, handsPath: path.join(dir, 'hands.jsonl'), manifest };
}

export function writeManifest(dir: string, manifest: RunManifest): void {
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}
