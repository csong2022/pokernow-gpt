/// <reference types="mocha" />
import { expect } from "chai";

import { DBService } from "../../src/services/db/db.service.ts";
import { HandOutcomesAPIService } from "../../src/services/db/handoutcomes.service.ts";
import type { HandOutcome } from "../../src/services/db/handoutcomes.service.ts";
import {
    bootstrapMean,
    bootstrapPairedDiff,
    makeRng,
    mean,
    percentile,
    stdDev,
} from "../../src/utils/bootstrap.util.ts";

const newDB = (): DBService => {
    const db = new DBService(":memory:");
    db.init();
    db.createTables();
    return db;
};

const baseOutcome = (overrides: Partial<HandOutcome> = {}): HandOutcome => ({
    hand_id: "g1:1",
    bot_uuid: "uuid-a",
    bot_name: "Bot1",
    model_provider: "OpenAI",
    model_name: "gpt-4.1-mini",
    starting_stack_BB: 100,
    ending_stack_BB: 105,
    stack_delta_BB: 5,
    position: "BTN",
    saw_showdown: 0,
    created_at: 1700000000000,
    ...overrides,
});

describe("HandOutcomes schema", () => {
    it("creates the HandOutcomes table with all expected columns", () => {
        const db = newDB();
        try {
            const cols = db.query(`PRAGMA table_info(HandOutcomes)`, []) as Array<{ name: string }>;
            const names = cols.map(c => c.name);
            for (const expected of [
                "hand_id", "bot_uuid", "bot_name",
                "model_provider", "model_name",
                "starting_stack_BB", "ending_stack_BB", "stack_delta_BB",
                "position", "saw_showdown", "created_at",
            ]) {
                expect(names).to.include(expected);
            }
        } finally {
            db.close();
        }
    });

    it("is idempotent — running createTables twice is safe", () => {
        const db = newDB();
        try {
            expect(() => db.createTables()).to.not.throw();
        } finally {
            db.close();
        }
    });
});

describe("HandOutcomesAPIService", () => {
    let db: DBService;
    let api: HandOutcomesAPIService;

    beforeEach(() => {
        db = newDB();
        api = new HandOutcomesAPIService(db);
    });

    afterEach(() => {
        db.close();
    });

    it("inserts and reads back a row", async () => {
        await api.insert(baseOutcome());
        const all = await api.getAll();
        expect(all).to.have.length(1);
        expect(all[0].hand_id).to.equal("g1:1");
        expect(all[0].stack_delta_BB).to.equal(5);
    });

    it("uses (hand_id, bot_uuid) as composite primary key — same hand, different bots both insert", async () => {
        await api.insert(baseOutcome({ bot_uuid: "uuid-a", bot_name: "Bot1" }));
        await api.insert(baseOutcome({ bot_uuid: "uuid-b", bot_name: "Bot2" }));
        const all = await api.getAll();
        expect(all).to.have.length(2);
    });

    it("INSERT OR REPLACE overwrites a duplicate (hand_id, bot_uuid) row", async () => {
        await api.insert(baseOutcome({ stack_delta_BB: 5 }));
        await api.insert(baseOutcome({ stack_delta_BB: -3 }));
        const all = await api.getAll();
        expect(all).to.have.length(1);
        expect(all[0].stack_delta_BB).to.equal(-3);
    });

    it("filters by model", async () => {
        await api.insert(baseOutcome({ hand_id: "g1:1", model_name: "gpt-4.1-mini" }));
        await api.insert(baseOutcome({ hand_id: "g1:2", model_name: "gpt-4.1-mini" }));
        await api.insert(baseOutcome({ hand_id: "g1:1", bot_uuid: "uuid-b", model_name: "gemini-2.5-pro" }));
        const openai = await api.getByModel("OpenAI", "gpt-4.1-mini");
        expect(openai).to.have.length(2);
    });
});

describe("bootstrap util", () => {
    describe("makeRng", () => {
        it("returns reproducible sequences when seeded", () => {
            const r1 = makeRng(42);
            const r2 = makeRng(42);
            for (let i = 0; i < 10; i++) {
                expect(r1()).to.equal(r2());
            }
        });

        it("produces values in [0, 1)", () => {
            const r = makeRng(1);
            for (let i = 0; i < 1000; i++) {
                const v = r();
                expect(v).to.be.gte(0);
                expect(v).to.be.lt(1);
            }
        });
    });

    describe("mean / stdDev / percentile", () => {
        it("computes mean correctly", () => {
            expect(mean([1, 2, 3, 4, 5])).to.be.closeTo(3, 1e-9);
            expect(mean([])).to.equal(0);
        });

        it("computes sample stdDev correctly", () => {
            // sample std of [1,2,3,4,5] is sqrt(10/4) = sqrt(2.5) ≈ 1.5811
            expect(stdDev([1, 2, 3, 4, 5])).to.be.closeTo(1.5811388, 1e-5);
            expect(stdDev([])).to.equal(0);
            expect(stdDev([7])).to.equal(0);
        });

        it("computes interpolated percentiles", () => {
            const sorted = [1, 2, 3, 4, 5];
            expect(percentile(sorted, 0)).to.equal(1);
            expect(percentile(sorted, 1)).to.equal(5);
            expect(percentile(sorted, 0.5)).to.equal(3);
            expect(percentile(sorted, 0.25)).to.equal(2);
        });
    });

    describe("bootstrapMean", () => {
        it("returns a CI that brackets the true mean for symmetric data", () => {
            // Synthetic per-hand outcomes drawn from N(0.05, 1) — i.e. true BB/hand = 0.05
            // so true BB/100 = 5.0. With n=2000 the bootstrap CI should comfortably bracket 5.
            const rng = makeRng(7);
            const values: number[] = [];
            for (let i = 0; i < 2000; i++) {
                // Box-Muller via two uniforms
                const u1 = Math.max(rng(), 1e-12);
                const u2 = rng();
                const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
                values.push(0.05 + z);
            }
            const res = bootstrapMean(values, 2000, makeRng(11), 100);
            expect(res.point).to.be.closeTo(5.0, 5);
            expect(res.ci_lo).to.be.lt(res.point);
            expect(res.ci_hi).to.be.gt(res.point);
            // True value 5 should fall inside the 95% CI almost always; with seed it's deterministic.
            expect(res.ci_lo).to.be.lt(5.0);
            expect(res.ci_hi).to.be.gt(5.0);
        });

        it("returns NaN CI for n < 2", () => {
            const r = bootstrapMean([3], 100, makeRng(1));
            expect(r.point).to.equal(3);
            expect(Number.isNaN(r.ci_lo)).to.equal(true);
            expect(Number.isNaN(r.ci_hi)).to.equal(true);
        });
    });

    describe("bootstrapPairedDiff", () => {
        it("paired CI is narrower than independent when within-pair correlation is positive", () => {
            // Both samples share a per-pair "shock" plus independent noise. Positive correlation
            // is the case where paired bootstrap genuinely improves precision — Var(A-B) is
            // smaller than Var(A) + Var(B) because the shocks cancel in the difference.
            const rng = makeRng(123);
            const n = 1000;
            const a: number[] = [];
            const b: number[] = [];
            const trueDiff = 2.0; // 200 BB/100 — large enough to be obvious in finite samples
            for (let i = 0; i < n; i++) {
                const shared = (rng() - 0.5) * 10;        // common shock, ±5
                const noiseA = (rng() - 0.5) * 1;         // small idiosyncratic, ±0.5
                const noiseB = (rng() - 0.5) * 1;
                a.push(shared + noiseA + trueDiff);
                b.push(shared + noiseB);
            }
            const paired = bootstrapPairedDiff(a, b, 2000, makeRng(99), 100);

            const ra = bootstrapMean(a, 2000, makeRng(101), 100);
            const rb = bootstrapMean(b, 2000, makeRng(102), 100);
            const indepWidth = (ra.ci_hi - ra.ci_lo) + (rb.ci_hi - rb.ci_lo);
            const pairedWidth = paired.ci_hi - paired.ci_lo;

            // True diff is 200 BB/100; paired estimate should land near it with a tight CI.
            expect(paired.point).to.be.closeTo(200, 30);
            expect(paired.ci_lo).to.be.lt(200);
            expect(paired.ci_hi).to.be.gt(200);
            // Paired width should be a small fraction of the naive sum-of-independent widths.
            expect(pairedWidth).to.be.lessThan(indepWidth * 0.5);
        });

        it("throws when a and b have different lengths", () => {
            expect(() => bootstrapPairedDiff([1, 2], [1, 2, 3], 100, makeRng(1))).to.throw();
        });
    });
});
