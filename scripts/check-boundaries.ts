/**
 * Core import-boundary checker.
 *
 * Enforces the seam in the core/live/arena layout: `src/core/**` (the
 * environment-agnostic poker brain) must never import PokerNow-specific /
 * adapter ("live") modules. See CLAUDE.md for the layout and rule.
 *
 * Scans every import specifier under src/core and flags any that reference a
 * forbidden adapter module.
 *
 *   npx tsx scripts/check-boundaries.ts            # report mode: print, exit 0
 *   npx tsx scripts/check-boundaries.ts --strict   # CI mode:     fail on any violation
 *
 * Report mode is the default for now because known violations exist and serve
 * as the migration roadmap (see CLAUDE.md). Switch CI to --strict once core
 * is clean.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const CORE_DIR = join(REPO_ROOT, "src", "core");

// Substrings that mark a PokerNow-specific / adapter ("live") module. Core may
// not import any of these.
const FORBIDDEN: ReadonlyArray<string> = [
    "puppeteer.service",
    "log.service",
    "log-processing",
    "message-processing",
    "action-executor",
    "state-builder",
    "http/", // the REST API under src/http
];

const IMPORT_RE = /(?:import|export)\b[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g;

type Violation = { file: string; specifier: string; matched: string };

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
    for (const file of walk(CORE_DIR)) {
        const src = readFileSync(file, "utf8");
        for (const match of src.matchAll(IMPORT_RE)) {
            const specifier = match[1] ?? match[2];
            if (!specifier) continue;
            const matched = FORBIDDEN.find((f) => specifier.includes(f));
            if (matched) {
                violations.push({
                    file: relative(REPO_ROOT, file).replace(/\\/g, "/"),
                    specifier,
                    matched,
                });
            }
        }
    }
    return violations;
}

const strict = process.argv.includes("--strict");
const violations = findViolations();

if (violations.length === 0) {
    console.log("✓ core boundary clean: no src/core import references a live/adapter module.");
    process.exit(0);
}

console.log(`Found ${violations.length} core boundary violation(s):\n`);
for (const v of violations) {
    console.log(`  ${v.file}`);
    console.log(`    → imports "${v.specifier}"  (forbidden: ${v.matched})`);
}
console.log(
    strict
        ? "\n✗ --strict: failing because core imports live/adapter code."
        : "\nReport mode (exit 0). These are the known migration roadmap items; run with --strict to fail.",
);

process.exit(strict ? 1 : 0);
