/// <reference types="mocha" />
import { expect } from "chai";

import { seatings } from "../../src/arena/duplicate-runner.ts";

// A seating maps seat -> agent index. Validity = it's a permutation of 0..P-1.
function isPermutation(s: number[], P: number): boolean {
    return s.length === P && new Set(s).size === P && s.every((x) => x >= 0 && x < P);
}
const key = (s: number[]) => s.join(",");

describe("duplicate seatings (rotation modes)", () => {
    it("cyclic yields P valid seatings, each model in each seat exactly once", () => {
        for (const P of [2, 3, 4]) {
            const s = seatings(P, "cyclic");
            expect(s).to.have.length(P);
            s.forEach((seat) => expect(isPermutation(seat, P)).to.equal(true));
            // each agent occupies each seat exactly once across the rotations
            for (let seat = 0; seat < P; seat++) {
                const occupants = new Set(s.map((row) => row[seat]));
                expect(occupants.size).to.equal(P);
            }
        }
    });

    it("full yields P! valid seatings (all permutations)", () => {
        expect(seatings(2, "full")).to.have.length(2);
        expect(seatings(3, "full")).to.have.length(6);
        expect(seatings(4, "full")).to.have.length(24);
        for (const seat of seatings(4, "full")) expect(isPermutation(seat, 4)).to.equal(true);
        // all distinct
        const set = new Set(seatings(4, "full").map(key));
        expect(set.size).to.equal(24);
    });

    it("at HU, cyclic == full (rotation is already complete)", () => {
        const c = new Set(seatings(2, "cyclic").map(key));
        const f = new Set(seatings(2, "full").map(key));
        expect(c).to.deep.equal(f);
    });

    it("at 3-max, full is a strict superset of cyclic (the reflections cyclic misses)", () => {
        const cyc = new Set(seatings(3, "cyclic").map(key));
        const full = seatings(3, "full").map(key);
        for (const c of cyc) expect(full).to.include(c);
        const missing = full.filter((p) => !cyc.has(p));
        expect(missing).to.have.length(3); // the 3 reflections
    });
});
