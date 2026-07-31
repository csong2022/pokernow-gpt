/**
 * Sole writer of src/config/models.json — the script-managed model registry.
 *
 *   npm run update-models
 *
 * For each provider it fetches the live "list models" endpoint, keeps only an
 * allowlisted family (gpt-5.4*, gemini-3*, claude-*-4*), and MERGES into the
 * registry without clobbering: existing ids, addedAt, deprecated, costs, and
 * reasoning are preserved; the (often alias) apiModelString on a matched entry is
 * kept as-is so it stays consistent with the provider SDK / factory.
 *
 * Providers return a mix of aliases and dated snapshots (e.g. "gpt-5.4-nano" and
 * "gpt-5.4-nano-2026-03-17"; Anthropic returns only dated "claude-haiku-4-5-…").
 * We collapse each to a FAMILY by stripping the date suffix and key the registry
 * on that family id — so snapshots dedupe and an alias-seeded entry isn't
 * spuriously deprecated by its dated sibling.
 *
 * Merge rules: new family -> added (addedAt=today, deprecated=false, costs 0,
 * reasoning false — fill by hand). Family that vanished from a fetched provider
 * -> deprecated=true (never deleted, so historical log ids stay resolvable). A
 * provider whose fetch fails is skipped entirely (its entries are preserved, not
 * deprecated). Output is sorted by id with a fixed key order, 2-space indent, and
 * a trailing newline, so reruns yield zero diff.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
dotenv.config();

import { parseRegistry, RegistryModel } from '../src/core/ai/model-registry.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.resolve(__dirname, '..', 'src', 'config', 'models.json');
const MANAGED_BY = 'scripts/update-models.ts';
const TODAY = new Date().toISOString().slice(0, 10);

interface RawModel { id: string; displayName: string }
interface ProviderSpec {
    provider: string;
    keep: (id: string) => boolean;
    fetch: () => Promise<RawModel[]>;
}

// Strip provider date suffixes: "-YYYY-MM-DD" (OpenAI) and "-YYYYMMDD" (Anthropic).
function familyOf(id: string): string {
    return id.replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/-\d{8}$/, '');
}

async function getJSON(url: string, headers: Record<string, string> = {}): Promise<any> {
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url.split('?')[0]}`);
    return r.json();
}

async function fetchOpenAI(): Promise<RawModel[]> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY not set');
    const j = await getJSON('https://api.openai.com/v1/models', { Authorization: `Bearer ${key}` });
    return (j.data ?? []).map((m: any) => ({ id: m.id, displayName: m.id }));
}

async function fetchGoogle(): Promise<RawModel[]> {
    const key = process.env.GOOGLEAI_API_KEY;
    if (!key) throw new Error('GOOGLEAI_API_KEY not set');
    const out: RawModel[] = [];
    let pageToken = '';
    do {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${key}` + (pageToken ? `&pageToken=${pageToken}` : '');
        const j = await getJSON(url);
        for (const m of j.models ?? []) {
            if (!(m.supportedGenerationMethods ?? []).includes('generateContent')) continue; // text-gen only
            out.push({ id: String(m.name).replace(/^models\//, ''), displayName: m.displayName ?? m.name });
        }
        pageToken = j.nextPageToken ?? '';
    } while (pageToken);
    return out;
}

async function fetchAnthropic(): Promise<RawModel[]> {
    const key = process.env.CLAUDEAI_API_KEY;
    if (!key) throw new Error('CLAUDEAI_API_KEY not set');
    const out: RawModel[] = [];
    let afterId = '';
    do {
        const url = 'https://api.anthropic.com/v1/models?limit=100' + (afterId ? `&after_id=${afterId}` : '');
        const j = await getJSON(url, { 'x-api-key': key, 'anthropic-version': '2023-06-01' });
        for (const m of j.data ?? []) out.push({ id: m.id, displayName: m.display_name ?? m.id });
        afterId = j.has_more ? j.last_id : '';
    } while (afterId);
    return out;
}

const PROVIDERS: ProviderSpec[] = [
    { provider: 'OpenAI', keep: (id) => (/^gpt-5\.\d/.test(id) || /^o3(-\d{4}-\d{2}-\d{2})?$/.test(id)) && !/codex/.test(id), fetch: fetchOpenAI },
    { provider: 'Google', keep: (id) => /^gemini-3/.test(id) && !/(image|tts|live|translate|customtools)/.test(id), fetch: fetchGoogle },
    { provider: 'Anthropic', keep: (id) => /^claude-(opus|sonnet|haiku)-4/.test(id), fetch: fetchAnthropic },
];

// Fixed key order so JSON.stringify is deterministic regardless of input order.
function canonical(m: RegistryModel): RegistryModel {
    return {
        id: m.id,
        provider: m.provider,
        apiModelString: m.apiModelString,
        displayName: m.displayName,
        reasoning: m.reasoning,
        inputCostPer1M: m.inputCostPer1M,
        outputCostPer1M: m.outputCostPer1M,
        addedAt: m.addedAt,
        deprecated: m.deprecated,
    };
}

interface Family { id: string; apiModelString: string; displayName: string }

function familiesOf(raw: RawModel[], keep: (id: string) => boolean): Map<string, Family> {
    const fams = new Map<string, Family>();
    for (const m of raw) {
        if (!keep(m.id)) continue;
        const id = familyOf(m.id);
        const existing = fams.get(id);
        // Prefer the dateless variant (id === family) as the representative apiModelString.
        if (!existing || m.id === id) fams.set(id, { id, apiModelString: m.id === id ? id : (existing?.apiModelString ?? m.id), displayName: m.displayName });
    }
    return fams;
}

async function main(): Promise<void> {
    const existing: RegistryModel[] = existsSync(REGISTRY_PATH)
        ? [...parseRegistry(readFileSync(REGISTRY_PATH, 'utf8'), REGISTRY_PATH).values()]
        : [];
    const existingById = new Map(existing.map((m) => [m.id, m]));

    const fetched = new Map<string, Map<string, Family>>(); // provider -> family map
    for (const p of PROVIDERS) {
        try {
            fetched.set(p.provider, familiesOf(await p.fetch(), p.keep));
        } catch (err) {
            console.warn(`[update-models] skipping ${p.provider}: ${(err as Error).message} (entries preserved, not deprecated)`);
        }
    }

    const added: string[] = [];
    const deprecated: string[] = [];
    const result: RegistryModel[] = [];

    // Reconcile existing entries.
    for (const e of existing) {
        const fams = fetched.get(e.provider);
        if (!fams) {
            result.push(e); // provider not fetched this run -> preserve untouched
            continue;
        }
        if (fams.has(e.id)) {
            if (e.deprecated) console.log(`[update-models] reactivated ${e.id}`);
            result.push({ ...e, deprecated: false }); // present -> active; preserve everything else
            fams.delete(e.id); // consumed; remaining families are genuinely new
        } else {
            result.push({ ...e, deprecated: true });
            if (!e.deprecated) deprecated.push(e.id);
        }
    }

    // Add new families.
    for (const [provider, fams] of fetched) {
        for (const fam of fams.values()) {
            if (existingById.has(fam.id)) continue;
            result.push({
                id: fam.id,
                provider,
                apiModelString: fam.apiModelString,
                displayName: fam.displayName,
                reasoning: 'none', // hand-set to a level (low/medium/high) later
                inputCostPer1M: 0,
                outputCostPer1M: 0,
                addedAt: TODAY,
                deprecated: false,
            });
            added.push(fam.id);
        }
    }

    result.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const doc = { _managedBy: MANAGED_BY, models: result.map(canonical) };
    writeFileSync(REGISTRY_PATH, JSON.stringify(doc, null, 2) + '\n');

    const unchanged = result.length - added.length - deprecated.length;
    console.log(`[update-models] wrote ${result.length} models -> ${path.relative(process.cwd(), REGISTRY_PATH)}`);
    console.log(`  added (${added.length}): ${added.join(', ') || '-'}`);
    console.log(`  deprecated (${deprecated.length}): ${deprecated.join(', ') || '-'}`);
    console.log(`  unchanged: ${unchanged}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
