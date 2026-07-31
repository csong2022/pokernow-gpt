/// <reference types="mocha" />
import { expect } from "chai";

import { reconstructHand } from "../../src/arena/analysis/reconstruct.ts";
import type { HandRecord } from "../../src/arena/analysis/types.ts";

// A realistic 3-max hand record (one LLM seat + reasoning trace, two reference seats).
const REC: HandRecord = {
    hand: 7,
    deal_id: 2,
    rotation: 1,
    agents: ["OpenAI:gpt-5.4-mini#0", "aggro", "tight"],
    hole_cards: [["Ah", "Kh"], ["7c", "2d"], ["Qs", "Qd"]],
    board: ["Kd", "9s", "2c", "Th", "5h"],
    deltas: [12, -6, -6],
    big_blind: 2,
    actions: [
        { seat: 1, type: "raises", amount: 6, street_index: 0 },
        { seat: 2, type: "folds", amount: 0, street_index: 0 },
        { seat: 0, type: "calls", amount: 4, street_index: 0 },
        { seat: 0, type: "checks", amount: 0, street_index: 1 },
        { seat: 1, type: "bets", amount: 8, street_index: 1 },
        { seat: 0, type: "calls", amount: 8, street_index: 1 },
    ],
    decisions: [
        {
            seat: 0, model_id: "OpenAI:gpt-5.4-mini", street: 0,
            prompt: "Street: preflop...\nTo call: 3 BB.\nWhat's my action?",
            raw_response: "BTN opened, I have AKs which dominates much of their range. I'll continue.\nFinal Answer: call 3",
            parsed_action: { action: "call", amount: 3 },
            events: [],
        },
    ],
    resolved_actions: [],
    malformed_events: [],
};

describe("reconstruct", () => {
    it("round-trips a hand record: players, street-by-street board+actions, deltas", () => {
        const r = reconstructHand(REC);

        // Players keyed to models (stub/reference names pass through, #seat stripped).
        expect(r.players.map((p) => p.model)).to.deep.equal(["OpenAI:gpt-5.4-mini", "aggro", "tight"]);
        expect(r.players[0].hole).to.deep.equal(["Ah", "Kh"]);

        // Streets present, with the correct community cards revealed per street.
        expect(r.streets.map((s) => s.label)).to.deep.equal(["preflop", "flop"]);
        expect(r.streets[0].board).to.deep.equal([]);                  // preflop: no board
        expect(r.streets[1].board).to.deep.equal(["Kd", "9s", "2c"]);  // flop: first 3

        // Ordered action sequence preserved with amounts + models.
        expect(r.streets[0].actions).to.deep.equal([
            { seat: 1, model: "aggro", type: "raises", amount: 6 },
            { seat: 2, model: "tight", type: "folds", amount: 0 },
            { seat: 0, model: "OpenAI:gpt-5.4-mini", type: "calls", amount: 4 },
        ]);

        // Final deltas reconstructed (and chip-conserving).
        expect(r.results.map((x) => x.delta)).to.deep.equal([12, -6, -6]);
        expect(r.results.reduce((s, x) => s + x.delta, 0)).to.equal(0);
    });

    it("carries raw_response per decision, separate from the parsed action", () => {
        const r = reconstructHand(REC);
        const d = r.decisions[0];
        expect(d.raw_response).to.contain("Final Answer: call 3");
        expect(d.raw_response).to.contain("dominates");          // reasoning text preserved
        expect(d.parsed_action).to.deep.equal({ action: "call", amount: 3 });
        // parsed action is a structured field, NOT derived from scanning raw_response.
        expect(d.parsed_action.action).to.not.equal(d.raw_response);
    });

    it("handles older logs without decisions/board (replays what's present)", () => {
        const minimal: HandRecord = {
            hand: 0, agents: ["A#0", "B#1"], deltas: [1, -1], big_blind: 2,
            actions: [{ seat: 0, type: "raises", amount: 4, street_index: 0 }],
            resolved_actions: [], malformed_events: [],
        };
        const r = reconstructHand(minimal);
        expect(r.streets).to.have.length(1);
        expect(r.decisions).to.deep.equal([]);
        expect(r.players[0].hole).to.deep.equal([]);
    });
});
