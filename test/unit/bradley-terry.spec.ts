/// <reference types="mocha" />
import { expect } from "chai";

import { pairwiseOutcomes, rankBradleyTerry, bootstrapRatings } from "../../src/arena/analysis/bradley-terry.ts";
import type { HandRecord } from "../../src/arena/analysis/types.ts";

// Minimal hand record: agents (seat->model#seat), deltas (seat chip delta), deal_id.
function hand(agents: string[], deltas: number[], deal_id?: number): HandRecord {
    return {
        hand: 0, agents, deltas, big_blind: 2,
        malformed_events: [], resolved_actions: [], ...(deal_id != null ? { deal_id } : {}),
    } as HandRecord;
}

describe("bradley-terry", () => {
    it("recovers the correct ordering from a transitive 3-model outcome set", () => {
        // A > B > C every hand (A top stack, C bottom) at a 3-max table.
        const records: HandRecord[] = [];
        for (let d = 0; d < 30; d++) {
            records.push(hand(["A#0", "B#1", "C#2"], [10, 0, -10], d));
        }
        const bt = rankBradleyTerry(records, { bootstrap: false });
        expect(bt.models.map((m) => m.model)).to.deep.equal(["A", "B", "C"]);
        expect(bt.models[0].rating).to.be.greaterThan(bt.models[1].rating);
        expect(bt.models[1].rating).to.be.greaterThan(bt.models[2].rating);
        // 3 pairwise comparisons per hand.
        expect(bt.nComparisons).to.equal(30 * 3);
        // A beat both others every hand; C lost to both every hand.
        const A = bt.models.find((m) => m.model === "A")!;
        expect(A.wins).to.equal(60);
        expect(A.losses).to.equal(0);
    });

    it("skips a model-vs-itself pair (same model in both seats)", () => {
        const outcomes = pairwiseOutcomes([hand(["A#0", "A#1"], [5, -5])]);
        expect(outcomes).to.have.length(0); // one model present -> no comparison
    });

    it("sums a multi-seat model's deltas into ONE comparison vs a third model", () => {
        // A in seats 0 and 1 (net +2 -3 = -1), B in seat 2 (+1). One A-vs-B outcome; B wins.
        const outcomes = pairwiseOutcomes([hand(["A#0", "A#1", "B#2"], [2, -3, 1])]);
        expect(outcomes).to.have.length(1);
        const o = outcomes[0];
        const scoreForA = o.a === "A" ? o.sa : 1 - o.sa;
        expect(scoreForA).to.equal(0); // A's total (-1) < B (+1) -> A loses
    });

    it("deal-level bootstrap gives WIDER CIs than (wrongly) per-hand bootstrap", () => {
        // 10 deals, outcome VARIES by deal (6 A-win, 4 B-win), each replayed 3x
        // IDENTICALLY. Per-hand bootstrap treats the 30 correlated hands as 30
        // independent units (too-narrow CI); deal-level resamples whole 3-hand
        // blocks (10 honest units), so its CI is wider.
        const records: HandRecord[] = [];
        for (let d = 0; d < 10; d++) {
            const aWins = d < 6;
            for (let r = 0; r < 3; r++) records.push(hand(["A#0", "B#1"], aWins ? [5, -5] : [-5, 5], d));
        }
        const models = ["A", "B"];
        const seeded = () => { let s = 42; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; };
        const byDeal = bootstrapRatings(records, models, { unit: "deal", iters: 300, rng: seeded() });
        const byHand = bootstrapRatings(records, models, { unit: "hand", iters: 300, rng: seeded() });
        const width = (ci: { low: number; high: number }) => ci.high - ci.low;
        expect(byDeal.unit).to.equal("deal");
        expect(width(byDeal.ci.get("A")!)).to.be.greaterThan(width(byHand.ci.get("A")!));
    });

    it("auto-detects deal vs hand bootstrap unit from deal_id presence", () => {
        const withDeals = rankBradleyTerry([hand(["A#0", "B#1"], [1, -1], 0), hand(["A#0", "B#1"], [1, -1], 1)], { bootstrapIters: 50 });
        expect(withDeals.bootstrapUnit).to.equal("deal");
        const plain = rankBradleyTerry([hand(["A#0", "B#1"], [1, -1]), hand(["A#0", "B#1"], [1, -1])], { bootstrapIters: 50 });
        expect(plain.bootstrapUnit).to.equal("hand");
    });
});
