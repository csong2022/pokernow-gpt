/// <reference types="mocha" />
import { expect } from "chai";

import { computeStyleByModel } from "../../src/arena/analysis/style.ts";
import type { ActionEntry, HandRecord, StyleStats } from "../../src/arena/analysis/types.ts";

const a = (type: string, seat: number, street_index = 0): ActionEntry => ({ type, amount: 0, seat, street_index });

function rec(agents: string[], actions: ActionEntry[] | undefined, hand = 0): HandRecord {
    return {
        hand,
        agents,
        deltas: agents.map(() => 0),
        big_blind: 2,
        malformed_events: [],
        resolved_actions: [],
        actions,
    };
}

const by = (style: StyleStats[], model: string): StyleStats => {
    const s = style.find((x) => x.model === model);
    expect(s, `model ${model} present`).to.not.equal(undefined);
    return s!;
};

describe("arena style stats", () => {
    it("computes VPIP/PFR/3-Bet/Fold-to-3-Bet/AFq from the action list", () => {
        // 3-max: A opens, B 3-bets, C folds, A folds to the 3-bet.
        const actions = [a("raises", 0), a("raises", 1), a("folds", 2), a("folds", 0)];
        const style = computeStyleByModel([rec(["A#0", "B#1", "C#2"], actions)]);

        const A = by(style, "A");
        expect(A.hands).to.equal(1);
        expect(A.vpipPct).to.equal(100);   // raised preflop
        expect(A.pfrPct).to.equal(100);
        expect(A.threeBetPct).to.equal(0); // opener, no 3-bet opportunity
        expect(A.facedThreeBet).to.equal(1);
        expect(A.foldToThreeBetPct).to.equal(100); // folded to the 3-bet
        expect(A.afqPct).to.equal(50);     // (0 bets + 1 raise) / (1 raise + 1 fold)

        const B = by(style, "B");
        expect(B.vpipPct).to.equal(100);
        expect(B.pfrPct).to.equal(100);
        expect(B.threeBetOpportunities).to.equal(1);
        expect(B.threeBetPct).to.equal(100); // 3-bet when it had the chance
        expect(B.afqPct).to.equal(100);

        const C = by(style, "C");
        expect(C.hands).to.equal(1);
        expect(C.vpipPct).to.equal(0); // folded preflop, no money in
        expect(C.pfrPct).to.equal(0);
        expect(C.afqPct).to.equal(0);  // (0 aggressive) / (1 fold)
    });

    it("excludes blind posts and non-voluntary actions from VPIP", () => {
        // A posts (ignored) then checks; B calls (voluntary). Neither raises.
        const actions = [a("posts", 0), a("checks", 0), a("calls", 1)];
        const style = computeStyleByModel([rec(["A#0", "B#1"], actions)]);
        expect(by(style, "A").vpipPct).to.equal(0); // post + check is not voluntary
        expect(by(style, "B").vpipPct).to.equal(100); // call is voluntary
        expect(by(style, "B").pfrPct).to.equal(0);    // but not a raise
    });

    it("aggregates by stripped model id across seats (rotation-safe)", () => {
        // Model m folds preflop from seat 0 in hand 1 and seat 1 in hand 2.
        const h1 = rec(["m#0", "x#1"], [a("folds", 0)], 0);
        const h2 = rec(["x#0", "m#1"], [a("folds", 1)], 1);
        const style = computeStyleByModel([h1, h2]);
        const m = by(style, "m");
        expect(m.hands).to.equal(2);  // one row per seat occupied, both hands
        expect(m.folds).to.equal(2);  // its folds merged across the two seats
        expect(m.vpipPct).to.equal(0);
        expect(by(style, "x").hands).to.equal(2);
    });

    it("skips records with no action list (older logs) without crashing", () => {
        const withActions = rec(["A#0", "B#1"], [a("raises", 0), a("folds", 1)]);
        const withoutActions = rec(["A#0", "B#1"], undefined);
        const style = computeStyleByModel([withActions, withoutActions]);
        // Only the record with actions contributes; A counted once, not twice.
        expect(by(style, "A").hands).to.equal(1);
        expect(computeStyleByModel([withoutActions])).to.deep.equal([]);
    });
});
