/**
 * Import-boundary checker for the core / live / arena layout.
 *
 * Each layer declares which import paths it may NOT reference; the checker scans
 * every layer that exists and flags violations. This enforces the dependency
 * DAG, not just the core seam — so a future `arena -> live` import is caught the
 * day `src/arena` appears, without anyone having to wire it up. See CLAUDE.md.
 *
 *   npx tsx scripts/check-boundaries.ts            # report mode: print, exit 0
 *   npx tsx scripts/check-boundaries.ts --strict   # CI mode:     fail on any violation
 *
 * Layers whose directory doesn't exist yet (e.g. arena) are skipped, so their
 * rules sit dormant until the code lands.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

interface LayerRule {
    name: string;
    dir: string;           // absolute path to the layer's source root
    forbidden: string[];   // import-specifier substrings this layer may not reference
}

// The dependency DAG. core is the pure poker brain (talks to adapters only via
// injected ports); live and arena are environment adapters that may use shared
// infrastructure (utils, services/db) and core, but never each other.
const RULES: ReadonlyArray<LayerRule> = [
    {
        // core depends only on core + utils + its own ports.
        name: "core",
        dir: join(REPO_ROOT, "src", "core"),
        forbidden: [
            "live/",          // the PokerNow adapter (puppeteer/log/parsers/state-builder/...)
            "arena/",         // the future owned-engine adapter
            "services/db/",   // DB services — core uses the PlayerStatsRepository port instead
            "http/",          // the REST API
        ],
    },
    {
        // live is the PokerNow adapter; it may use core + shared infra, not arena.
        name: "live",
        dir: join(REPO_ROOT, "src", "live"),
        forbidden: ["arena/"],
    },
    {
        // arena (when it exists) is a sibling adapter; it must not reach into the
        // PokerNow adapter. It MAY use core + shared infra (utils, services/db).
        name: "arena",
        dir: join(REPO_ROOT, "src", "arena"),
        forbidden: ["live/", "http/"],
    },
];

const IMPORT_RE = /(?:import|export)\b[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g;

type Violation = { layer: string; file: string; specifier: string; matched: string };

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (entry.endsWith(".ts")) out.push(full);
    }
    return out;
}

function findViolations(): Violation[] {
    const violations: Violation[] = [];
    for (const rule of RULES) {
        if (!existsSync(rule.dir)) continue; // dormant until the layer exists
        for (const file of walk(rule.dir)) {
            const src = readFileSync(file, "utf8");
            for (const match of src.matchAll(IMPORT_RE)) {
                const specifier = match[1] ?? match[2];
                if (!specifier) continue;
                const matched = rule.forbidden.find((f) => specifier.includes(f));
                if (matched) {
                    violations.push({
                        layer: rule.name,
                        file: relative(REPO_ROOT, file).replace(/\\/g, "/"),
                        specifier,
                        matched,
                    });
                }
            }
        }
    }
    return violations;
}

const strict = process.argv.includes("--strict");
const violations = findViolations();

if (violations.length === 0) {
    const layers = RULES.filter((r) => existsSync(r.dir)).map((r) => r.name).join(", ");
    console.log(`✓ boundaries clean: no forbidden cross-layer imports (checked: ${layers}).`);
    process.exit(0);
}

console.log(`Found ${violations.length} boundary violation(s):\n`);
for (const v of violations) {
    console.log(`  [${v.layer}] ${v.file}`);
    console.log(`    → imports "${v.specifier}"  (forbidden: ${v.matched})`);
}
console.log(
    strict
        ? "\n✗ --strict: failing because a layer imports across a forbidden boundary."
        : "\nReport mode (exit 0). Run with --strict to fail the build.",
);

process.exit(strict ? 1 : 0);
