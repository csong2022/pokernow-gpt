import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

import type { RunFormat, RunManifest } from '../run-manifest.ts';

// Pure/offline run index: scan arena-runs/*/manifest.json into memory and filter
// with simple predicates (no DSL, no DB). Same discipline as the bb/100 analyzer —
// reads JSON, never the engine. Filters below are pure functions over the loaded
// array so they're trivially unit-testable without touching the filesystem.

export interface LoadedRun {
    manifest: RunManifest;
    dir: string;
    handsPath: string;
}

export function loadManifests(runsRoot: string): LoadedRun[] {
    if (!existsSync(runsRoot)) return [];
    const runs: LoadedRun[] = [];
    for (const entry of readdirSync(runsRoot)) {
        const dir = path.join(runsRoot, entry);
        if (!statSync(dir).isDirectory()) continue;
        const manifestPath = path.join(dir, 'manifest.json');
        if (!existsSync(manifestPath)) continue;
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as RunManifest;
        runs.push({ manifest, dir, handsPath: path.join(dir, 'hands.jsonl') });
    }
    return runs;
}

export function byFormat(runs: LoadedRun[], format: RunFormat): LoadedRun[] {
    return runs.filter((r) => r.manifest.format === format);
}

export function byModel(runs: LoadedRun[], modelId: string): LoadedRun[] {
    return runs.filter((r) => r.manifest.models.includes(modelId));
}

export function byTag(runs: LoadedRun[], tag: string): LoadedRun[] {
    return runs.filter((r) => r.manifest.tags.includes(tag));
}

export interface RunFilter {
    format?: RunFormat;
    model?: string;
    tag?: string;
}

// Combined AND-filter. Undefined fields are ignored, so an empty filter matches all.
export function filterRuns(runs: LoadedRun[], f: RunFilter): LoadedRun[] {
    let out = runs;
    if (f.format) out = byFormat(out, f.format);
    if (f.model) out = byModel(out, f.model);
    if (f.tag) out = byTag(out, f.tag);
    return out;
}

// Distinct formats present in a selection — used by the analysis CLI to refuse/group
// rather than silently pool incompatible (e.g. HU + 3max) data.
export function formatsIn(runs: LoadedRun[]): RunFormat[] {
    return [...new Set(runs.map((r) => r.manifest.format))];
}
