/// <reference types="mocha" />
import { expect } from "chai";

import { parseHandLogs } from "../../src/arena/analysis/load.ts";
import { aggregateByModel, checkIntegrity, modelIdOf } from "../../src/arena/analysis/aggregate.ts";

// Hand-crafted fixture: heads-up, bb = 2 every hand, model A in seat 0, B in seat 1.
// Per-hand chip deltas chosen so the bb math is verifiable by hand:
//   A chips  [ 4, -2,  6,  0 ]  -> A bb  [ 2, -1,  3,  0 ]  (B is the negation)
//   A mean   = (2 - 1 + 3 + 0) / 4 = 1 bb/hand
//   bb/100   = 100 ; mbb/hand = 1000 ; net bb = 4
//   sample variance = ((1)^2+(2)^2+(2)^2+(1)^2)/(4-1) = 10/3
//   stddev   = sqrt(10/3)        = 1.8257418584
//   SE       = stddev / sqrt(4)  = 0.9128709292
//   95% CI half-width (bb/100) = 1.96 * SE * 100 = 178.9227061
//   CI = [100 - 178.9227061, 100 + 178.9227061] = [-78.9227061, 278.9227061]
const FIXTURE = [
    { hand: 0, big_blind: 2, agents: ["A#0", "B#1"], deltas: [4, -4], resolved_actions: [{ seat: 0 }, { seat: 1 }], malformed_events: [{ seat: 0, reason: "clamp" }] },
    { hand: 1, big_blind: 2, agents: ["A#0", "B#1"], deltas: [-2, 2], resolved_actions: [{ seat: 0 }, { seat: 1 }], malformed_events: [] },
    { hand: 2, big_blind: 2, agents: ["A#0", "B#1"], deltas: [6, -6], resolved_actions: [{ seat: 0 }, { seat: 1 }], malformed_events: [] },
    { hand: 3, big_blind: 2, agents: ["A#0", "B#1"], deltas: [0, 0], resolved_actions: [{ seat: 0 }, { seat: 1 }], malformed_events: [] },
];
const FIXTURE_JSONL = FIXTURE.map((r) => JSON.stringify(r)).join("\n") + "\n\n"; // trailing blank line

describe("arena analysis", () => {
    describe("modelIdOf", () => {
        it("strips the #seat suffix", () => {
            expect(modelIdOf("OpenAI:gpt-5.4-nano#0")).to.equal("OpenAI:gpt-5.4-nano");
            expect(modelIdOf("stub#11")).to.equal("stub");
            expect(modelIdOf("noSuffix")).to.equal("noSuffix");
        });
    });

    describe("parseHandLogs", () => {
        it("parses JSONL and skips blank lines", () => {
            const recs = parseHandLogs(FIXTURE_JSONL);
            expect(recs).to.have.length(4);
            expect(recs[0].agents).to.deep.equal(["A#0", "B#1"]);
        });
        it("fails loudly on a malformed line with its line number", () => {
            expect(() => parseHandLogs('{"ok":1}\nnot json\n')).to.throw(/line 2/);
        });
    });

    describe("aggregateByModel", () => {
        const recs = parseHandLogs(FIXTURE_JSONL);
        const byModel = new Map(aggregateByModel(recs).map((s) => [s.model, s]));

        it("aggregates by model identity (two models)", () => {
            expect([...byModel.keys()].sort()).to.deep.equal(["A", "B"]);
        });

        it("computes bb/100, mbb/hand, net bb (verified by hand)", () => {
            const a = byModel.get("A")!;
            expect(a.hands).to.equal(4);
            expect(a.netBB).to.be.closeTo(4, 1e-9);
            expect(a.meanBBPerHand).to.be.closeTo(1, 1e-9);
            expect(a.bbPer100).to.be.closeTo(100, 1e-9);
            expect(a.mbbPerHand).to.be.closeTo(1000, 1e-9);
            expect(byModel.get("B")!.bbPer100).to.be.closeTo(-100, 1e-9);
        });

        it("computes sample stddev, SE, and 95% CI in bb/100 (verified by hand)", () => {
            const a = byModel.get("A")!;
            expect(a.stddevBBPerHand).to.be.closeTo(1.8257418584, 1e-6);
            expect(a.standardError).to.be.closeTo(0.9128709292, 1e-6);
            expect(a.ci95HalfWidthBBPer100!).to.be.closeTo(178.9227061, 1e-4);
            expect(a.ci95BBPer100!.low).to.be.closeTo(-78.9227061, 1e-4);
            expect(a.ci95BBPer100!.high).to.be.closeTo(278.9227061, 1e-4);
        });

        it("computes malformed count and rate over decisions", () => {
            const a = byModel.get("A")!;
            expect(a.decisions).to.equal(4);
            expect(a.malformedCount).to.equal(1);
            expect(a.malformedRate).to.be.closeTo(0.25, 1e-9);
            expect(byModel.get("B")!.malformedCount).to.equal(0);
        });

        it("reports CI as null when n < 2", () => {
            const one = aggregateByModel(parseHandLogs(JSON.stringify(FIXTURE[0]) + "\n"));
            for (const s of one) expect(s.ci95BBPer100).to.equal(null);
        });
    });

    describe("checkIntegrity", () => {
        it("passes a clean log", () => {
            expect(checkIntegrity(parseHandLogs(FIXTURE_JSONL))).to.deep.equal([]);
        });
        it("flags a chip-conservation violation", () => {
            const corrupt = parseHandLogs('{"hand":7,"big_blind":2,"agents":["A#0","B#1"],"deltas":[4,-3],"resolved_actions":[],"malformed_events":[]}\n');
            const v = checkIntegrity(corrupt);
            expect(v).to.have.length(1);
            expect(v[0].kind).to.equal("chip-conservation");
            expect(v[0].hand).to.equal(7);
        });
        it("flags an empty log", () => {
            const v = checkIntegrity([]);
            expect(v).to.have.length(1);
            expect(v[0].kind).to.equal("no-hands");
        });
    });
});
