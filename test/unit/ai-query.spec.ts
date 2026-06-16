/// <reference types="mocha" />
import { expect } from "chai";

import { parseResponse } from "../../src/core/ai/ai-query.helper.ts";

describe("parseResponse (Final Answer anchored)", () => {
    it("extracts action + size from a multi-paragraph reasoning response", () => {
        const msg = [
            "Let me think. I'm in the BB with AKs facing a small open.",
            "Pot odds are good and I have a strong hand, so I'll re-raise for value.",
            "",
            "Final Answer: raise 6",
        ].join("\n");
        expect(parseResponse(msg)).to.deep.equal({ action_str: "raise", bet_size_in_BBs: 6 });
    });

    it("ignores poker words in the reasoning body (decoy)", () => {
        const msg = "I considered folding but my equity is too high, so I will raise.\nFinal Answer: raise 9";
        expect(parseResponse(msg)).to.deep.equal({ action_str: "raise", bet_size_in_BBs: 9 });
    });

    it("uses the LAST final-answer line if more than one appears", () => {
        const msg = "Draft: Final Answer: call 2\nOn reflection that's wrong.\nFinal Answer: fold";
        expect(parseResponse(msg)).to.deep.equal({ action_str: "fold", bet_size_in_BBs: 0 });
    });

    it("handles fold/check with no size, and all-in normalization", () => {
        expect(parseResponse("Final Answer: check").action_str).to.equal("check");
        expect(parseResponse("blah\nFinal Answer: fold").action_str).to.equal("fold");
        expect(parseResponse("Final Answer: all-in").action_str).to.equal("all-in");
        expect(parseResponse("Final Answer: all in").action_str).to.equal("all-in");
    });

    it("is tolerant of case and punctuation in the marker", () => {
        expect(parseResponse("reasoning...\nfinal answer - CALL 7")).to.deep.equal({ action_str: "call", bet_size_in_BBs: 7 });
    });

    it("returns an empty action when no final-answer line exists (triggers rethink)", () => {
        expect(parseResponse("I think I will raise to 6 big blinds here.")).to.deep.equal({ action_str: "", bet_size_in_BBs: 0 });
        expect(parseResponse("")).to.deep.equal({ action_str: "", bet_size_in_BBs: 0 });
    });
});
