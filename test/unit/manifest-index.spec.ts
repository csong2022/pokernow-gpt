/// <reference types="mocha" />
import { expect } from "chai";

import { byFormat, byModel, byTag, filterRuns, formatsIn } from "../../src/arena/analysis/manifest-index.ts";
import type { LoadedRun } from "../../src/arena/analysis/manifest-index.ts";
import type { RunManifest } from "../../src/arena/run-manifest.ts";

// In-memory fixture runs (the filters are pure over the loaded array, so no fs needed).
function run(runId: string, m: Partial<RunManifest>): LoadedRun {
    const manifest: RunManifest = {
        runId,
        createdAt: "2026-06-15T00:00:00.000Z",
        gitCommit: null,
        format: "HU",
        models: [],
        rotation: "full",
        deals: 100,
        replaysPerDeal: 2,
        tags: [],
        notes: "",
        results: null,
        ...m,
    };
    return { manifest, dir: `arena-runs/${runId}`, handsPath: `arena-runs/${runId}/hands.jsonl` };
}

const RUNS: LoadedRun[] = [
    run("r-hu-mini-haiku", { format: "HU", models: ["gpt-5.4-mini", "claude-haiku-4-5"], tags: ["hypothesis-test"] }),
    run("r-3max-field", { format: "3max", models: ["gpt-5.4-mini", "claude-haiku-4-5", "gemini-3.5-flash"], tags: ["hypothesis-test"] }),
    run("r-hu-stub", { format: "HU", models: [], tags: ["stub", "smoke"] }),
    run("r-3max-cal", { format: "3max", models: [], tags: ["calibration"] }),
];

const ids = (runs: LoadedRun[]) => runs.map((r) => r.manifest.runId).sort();

describe("manifest index filters", () => {
    it("byFormat selects only that format", () => {
        expect(ids(byFormat(RUNS, "HU"))).to.deep.equal(["r-hu-mini-haiku", "r-hu-stub"]);
        expect(ids(byFormat(RUNS, "3max"))).to.deep.equal(["r-3max-cal", "r-3max-field"]);
    });

    it("byModel matches runs whose models include the id (across formats)", () => {
        expect(ids(byModel(RUNS, "gpt-5.4-mini"))).to.deep.equal(["r-3max-field", "r-hu-mini-haiku"]);
        expect(ids(byModel(RUNS, "gemini-3.5-flash"))).to.deep.equal(["r-3max-field"]);
        expect(byModel(RUNS, "not-a-model")).to.have.length(0);
    });

    it("byTag matches runs carrying the tag", () => {
        expect(ids(byTag(RUNS, "hypothesis-test"))).to.deep.equal(["r-3max-field", "r-hu-mini-haiku"]);
        expect(ids(byTag(RUNS, "calibration"))).to.deep.equal(["r-3max-cal"]);
    });

    it("filterRuns ANDs the provided fields and ignores undefined ones", () => {
        expect(ids(filterRuns(RUNS, { format: "3max", tag: "hypothesis-test" }))).to.deep.equal(["r-3max-field"]);
        expect(ids(filterRuns(RUNS, { format: "HU", model: "gpt-5.4-mini" }))).to.deep.equal(["r-hu-mini-haiku"]);
        expect(filterRuns(RUNS, {})).to.have.length(4); // empty filter matches all
    });

    it("formatsIn reports distinct formats (the never-pool guardrail signal)", () => {
        expect(formatsIn(RUNS).sort()).to.deep.equal(["3max", "HU"]);
        expect(formatsIn(byFormat(RUNS, "HU"))).to.deep.equal(["HU"]);
    });
});
