/// <reference types="mocha" />
import { expect } from "chai";

import { parseRegistry, resolveModel, toAIConfig } from "../../src/core/ai/model-registry.ts";

const VALID = JSON.stringify({
    _managedBy: "scripts/update-models.ts",
    models: [
        { id: "claude-haiku-4-5", provider: "Anthropic", apiModelString: "claude-haiku-4-5", displayName: "Claude Haiku 4.5", reasoning: "medium", inputCostPer1M: 1, outputCostPer1M: 5, addedAt: "2026-06-15", deprecated: false },
        { id: "gpt-5.4-nano", provider: "OpenAI", apiModelString: "gpt-5.4-nano", displayName: "GPT-5.4 Nano", reasoning: "none", inputCostPer1M: 0, outputCostPer1M: 0, addedAt: "2026-06-15", deprecated: false },
    ],
});

describe("model registry", () => {
    it("parses a valid registry into an id->entry map", () => {
        const reg = parseRegistry(VALID);
        expect([...reg.keys()].sort()).to.deep.equal(["claude-haiku-4-5", "gpt-5.4-nano"]);
        expect(reg.get("gpt-5.4-nano")!.provider).to.equal("OpenAI");
    });

    it("toAIConfig maps id -> {provider, model_name=apiModelString, playstyle}", () => {
        const reg = parseRegistry(VALID);
        expect(toAIConfig(reg, "claude-haiku-4-5", "aggressive")).to.deep.equal({
            provider: "Anthropic",
            model_name: "claude-haiku-4-5",
            playstyle: "aggressive",
        });
        expect(toAIConfig(reg, "gpt-5.4-nano").playstyle).to.equal("neutral"); // default
    });

    it("resolveModel throws a clear error on an unregistered id", () => {
        const reg = parseRegistry(VALID);
        expect(() => resolveModel(reg, "does-not-exist")).to.throw(/unknown model id: does-not-exist \(not in registry\)/);
    });

    describe("loud validation", () => {
        const base = () => ({ id: "m", provider: "P", apiModelString: "m", displayName: "M", reasoning: "none", inputCostPer1M: 0, outputCostPer1M: 0, addedAt: "2026-06-15", deprecated: false });
        const wrap = (models: any[]) => JSON.stringify({ models });

        it("rejects a missing required field, naming the entry", () => {
            const m: any = base(); delete m.apiModelString;
            expect(() => parseRegistry(wrap([m]))).to.throw(/models\[0\].*apiModelString/);
        });
        it("rejects a negative cost", () => {
            const m: any = base(); m.inputCostPer1M = -1;
            expect(() => parseRegistry(wrap([m]))).to.throw(/inputCostPer1M.*>= 0/);
        });
        it("rejects an invalid reasoning level", () => {
            const m: any = base(); m.reasoning = "yes";
            expect(() => parseRegistry(wrap([m]))).to.throw(/reasoning.*none \| low \| medium \| high/);
        });
        it("rejects duplicate ids", () => {
            expect(() => parseRegistry(wrap([base(), base()]))).to.throw(/duplicate model id "m"/);
        });
        it("rejects a non-array models field", () => {
            expect(() => parseRegistry(JSON.stringify({ models: {} }))).to.throw(/expected top-level/);
        });
        it("rejects invalid JSON", () => {
            expect(() => parseRegistry("{not json")).to.throw(/not valid JSON/);
        });
        it("rejects an empty registry", () => {
            expect(() => parseRegistry(wrap([]))).to.throw(/0 models/);
        });
    });
});
