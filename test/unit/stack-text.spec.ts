/// <reference types="mocha" />
import { expect } from "chai";

import { parseStackText } from "../../src/live/pokernow/message-processing.util.ts";
import { convertToBBs } from "../../src/core/poker/value-conversion.util.ts";

describe("parseStackText", () => {
    it("reads a plain stack", () => {
        expect(parseStackText("400")).to.equal(400);
    });

    // Regression: the exact text observed live at hand end, which produced
    // "NOT NULL constraint failed: HandOutcomes.ending_stack_BB". The element
    // carries the pending pot award alongside the stack.
    it("ignores the pot-award animation suffix", () => {
        expect(parseStackText("400 +1200")).to.equal(400);
    });

    it("ignores a loss animation suffix", () => {
        expect(parseStackText("400 -50")).to.equal(400);
    });

    it("strips thousands separators", () => {
        expect(parseStackText("1,000")).to.equal(1000);
        expect(parseStackText("12,345 +6,789")).to.equal(12345);
    });

    it("handles decimals and surrounding whitespace", () => {
        expect(parseStackText("  99.5  ")).to.equal(99.5);
    });

    it("returns NaN when there is no number to read", () => {
        for (const bad of ["", "   ", "all in", null, undefined]) {
            expect(parseStackText(bad as any), `input ${JSON.stringify(bad)}`).to.be.NaN;
        }
    });

    // The actual failure chain: NaN survives the BB conversion, and better-sqlite3
    // binds a non-finite number as NULL — hence the NOT NULL violation.
    it("keeps the BB conversion finite for animated text (the bug)", () => {
        const big_blind = 20;
        expect(convertToBBs(Number("400 +1200"), big_blind), "old behavior").to.be.NaN;
        expect(convertToBBs(parseStackText("400 +1200"), big_blind)).to.equal(20);
    });
});
