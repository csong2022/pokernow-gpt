import { readFileSync } from 'node:fs';

import { AIConfig } from './ai-config.interface.ts';

// A model registry entry. This is DATA loaded at runtime from config/models.json
// (script-managed; see scripts/update-models.ts) — never import-baked. The stable
// `id` is the key referenced across the arena; `apiModelString` is the volatile
// provider surface string and may change underneath a stable id.
export interface RegistryModel {
    id: string;
    provider: string;
    apiModelString: string;
    displayName: string;
    reasoning: boolean;
    inputCostPer1M: number;
    outputCostPer1M: number;
    addedAt: string;
    deprecated: boolean;
}

export type ModelRegistry = Map<string, RegistryModel>;

function fail(source: string, msg: string): never {
    throw new Error(`Invalid model registry (${source}): ${msg}`);
}

// Parse + validate registry JSON text into an id -> entry map. Pure (no fs), so
// it's directly testable. Fails LOUD, naming the offending entry — a malformed
// registry must never silently pass (same principle as the analyzer guards).
export function parseRegistry(text: string, source = 'config/models.json'): ModelRegistry {
    let doc: any;
    try {
        doc = JSON.parse(text);
    } catch (err) {
        fail(source, `not valid JSON: ${(err as Error).message}`);
    }
    if (!doc || !Array.isArray(doc.models)) {
        fail(source, 'expected top-level { "models": [...] }');
    }

    const registry: ModelRegistry = new Map();
    doc.models.forEach((m: any, i: number) => {
        const where = `models[${i}]${m && m.id ? ` (id "${m.id}")` : ''}`;
        const str = (field: string) => {
            if (typeof m?.[field] !== 'string' || m[field].length === 0) {
                fail(source, `${where}: missing/empty string field "${field}"`);
            }
        };
        const bool = (field: string) => {
            if (typeof m?.[field] !== 'boolean') fail(source, `${where}: field "${field}" must be a boolean`);
        };
        const cost = (field: string) => {
            if (typeof m?.[field] !== 'number' || !Number.isFinite(m[field]) || m[field] < 0) {
                fail(source, `${where}: field "${field}" must be a number >= 0`);
            }
        };
        str('id');
        str('provider');
        str('apiModelString');
        str('displayName');
        str('addedAt');
        bool('reasoning');
        bool('deprecated');
        cost('inputCostPer1M');
        cost('outputCostPer1M');

        if (registry.has(m.id)) fail(source, `duplicate model id "${m.id}"`);
        registry.set(m.id, m as RegistryModel);
    });

    if (registry.size === 0) fail(source, 'registry contains 0 models');
    return registry;
}

// Read + validate the registry from a file PATH supplied by the composition root
// (core hardcodes no path).
export function loadRegistry(filePath: string): ModelRegistry {
    return parseRegistry(readFileSync(filePath, 'utf8'), filePath);
}

// Unknown-model guard: resolve a referenced id or throw a clear error.
export function resolveModel(registry: ModelRegistry, id: string): RegistryModel {
    const model = registry.get(id);
    if (!model) throw new Error(`unknown model id: ${id} (not in registry)`);
    return model;
}

// Resolve a stable id to an AIConfig (playstyle is a per-seat run choice, not a
// registry field, so the caller supplies it).
export function toAIConfig(registry: ModelRegistry, id: string, playstyle = 'neutral'): AIConfig {
    const model = resolveModel(registry, id);
    return { provider: model.provider, model_name: model.apiModelString, playstyle };
}
