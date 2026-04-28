/// <reference types="mocha" />
import { expect } from "chai";

import { DBService } from "../../src/services/db/db.service.ts";
import { PlayerStatsAPIService } from "../../src/services/db/playerstatsapi.service.ts";

const baseStats = (overrides: Partial<Record<string, any>> = {}) => ({
    name: "alice",
    total_hands: 0,
    walks: 0,
    vpip_hands: 0,
    pfr_hands: 0,
    three_bet_hands: 0,
    three_bet_opportunities: 0,
    faced_three_bet: 0,
    folded_to_three_bet: 0,
    total_bets: 0,
    total_raises: 0,
    total_calls: 0,
    total_folds: 0,
    ...overrides,
});

const newDB = (): DBService => {
    const db = new DBService(":memory:");
    db.init();
    db.createTables();
    return db;
};

describe("DBService", () => {
    describe("init + createTables", () => {
        it("creates the PlayerStats table with all expected columns", () => {
            const db = newDB();
            try {
                const cols = db.query(`PRAGMA table_info(PlayerStats)`, []) as Array<{ name: string }>;
                const names = cols.map(c => c.name);
                for (const expected of [
                    "name", "total_hands", "walks",
                    "vpip_hands", "pfr_hands",
                    "three_bet_hands", "three_bet_opportunities",
                    "faced_three_bet", "folded_to_three_bet",
                    "total_bets", "total_raises", "total_calls", "total_folds",
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
                const cols = db.query(`PRAGMA table_info(PlayerStats)`, []) as Array<{ name: string }>;
                expect(cols.length).to.be.greaterThan(0);
            } finally {
                db.close();
            }
        });
    });

    describe("query", () => {
        it("returns rows for a SELECT", () => {
            const db = newDB();
            try {
                db.query(
                    `INSERT INTO PlayerStats (name, total_hands, walks, vpip_hands, pfr_hands)
                     VALUES (?, ?, ?, ?, ?)`,
                    ["alice", 1, 0, 1, 1],
                );
                const rows = db.query(`SELECT name, total_hands FROM PlayerStats WHERE name = ?`, ["alice"]);
                expect(rows).to.have.length(1);
                expect(rows[0]).to.include({ name: "alice", total_hands: 1 });
            } finally {
                db.close();
            }
        });

        it("returns an empty array for INSERT/UPDATE/DELETE", () => {
            const db = newDB();
            try {
                const insert = db.query(
                    `INSERT INTO PlayerStats (name, total_hands, walks, vpip_hands, pfr_hands)
                     VALUES (?, ?, ?, ?, ?)`,
                    ["alice", 0, 0, 0, 0],
                );
                expect(insert).to.deep.equal([]);

                const update = db.query(
                    `UPDATE PlayerStats SET total_hands = ? WHERE name = ?`,
                    [5, "alice"],
                );
                expect(update).to.deep.equal([]);

                const remove = db.query(`DELETE FROM PlayerStats WHERE name = ?`, ["alice"]);
                expect(remove).to.deep.equal([]);
            } finally {
                db.close();
            }
        });
    });

    describe("transaction", () => {
        it("commits all writes when the callback completes", () => {
            const db = newDB();
            try {
                db.transaction(() => {
                    db.query(`INSERT INTO PlayerStats (name, total_hands, walks, vpip_hands, pfr_hands) VALUES (?, ?, ?, ?, ?)`, ["alice", 1, 0, 1, 1]);
                    db.query(`INSERT INTO PlayerStats (name, total_hands, walks, vpip_hands, pfr_hands) VALUES (?, ?, ?, ?, ?)`, ["bob", 1, 0, 0, 0]);
                });
                const rows = db.query(`SELECT name FROM PlayerStats ORDER BY name`, []);
                expect(rows.map((r: any) => r.name)).to.deep.equal(["alice", "bob"]);
            } finally {
                db.close();
            }
        });

        it("rolls back all writes when the callback throws", () => {
            const db = newDB();
            try {
                db.query(`INSERT INTO PlayerStats (name, total_hands, walks, vpip_hands, pfr_hands) VALUES (?, ?, ?, ?, ?)`, ["seed", 0, 0, 0, 0]);
                expect(() => db.transaction(() => {
                    db.query(`UPDATE PlayerStats SET total_hands = ? WHERE name = ?`, [99, "seed"]);
                    throw new Error("boom");
                })).to.throw("boom");

                const rows = db.query(`SELECT total_hands FROM PlayerStats WHERE name = ?`, ["seed"]);
                expect(rows[0].total_hands).to.equal(0);
            } finally {
                db.close();
            }
        });
    });

    describe("addColumnIfMissing migration", () => {
        it("adds new columns when the existing schema is older", () => {
            const db = new DBService(":memory:");
            db.init();
            // Simulate an older schema lacking the 3-bet/AFq columns
            db.query(`CREATE TABLE PlayerStats (
                name TEXT PRIMARY KEY NOT NULL,
                total_hands INT NOT NULL,
                walks INT NOT NULL,
                vpip_hands INT NOT NULL,
                pfr_hands INT NOT NULL
            )`, []);
            // createTables should ALTER in the missing columns idempotently
            db.createTables();
            try {
                const cols = (db.query(`PRAGMA table_info(PlayerStats)`, []) as Array<{ name: string }>).map(c => c.name);
                expect(cols).to.include("three_bet_hands");
                expect(cols).to.include("three_bet_opportunities");
                expect(cols).to.include("faced_three_bet");
                expect(cols).to.include("folded_to_three_bet");
                expect(cols).to.include("total_bets");
                expect(cols).to.include("total_raises");
                expect(cols).to.include("total_calls");
                expect(cols).to.include("total_folds");
            } finally {
                db.close();
            }
        });
    });
});

describe("PlayerStatsAPIService", () => {
    let db: DBService;
    let api: PlayerStatsAPIService;

    beforeEach(() => {
        db = newDB();
        api = new PlayerStatsAPIService(db);
    });

    afterEach(() => {
        db.close();
    });

    describe("create + get", () => {
        it("returns an empty result when the player doesn't exist", async () => {
            const row = await api.get("nobody");
            expect(row).to.satisfy((v: any) => v === undefined || v === "");
        });

        it("roundtrips a player's stats", async () => {
            await api.create(baseStats({ name: "alice", total_hands: 3, vpip_hands: 2, pfr_hands: 1 }));
            const row = await api.get("alice") as any;
            expect(row.name).to.equal("alice");
            expect(row.total_hands).to.equal(3);
            expect(row.vpip_hands).to.equal(2);
            expect(row.pfr_hands).to.equal(1);
        });

        it("rejects duplicate inserts (PRIMARY KEY)", async () => {
            await api.create(baseStats({ name: "alice" }));
            let threw = false;
            try {
                await api.create(baseStats({ name: "alice" }));
            } catch {
                threw = true;
            }
            expect(threw).to.equal(true);
        });
    });

    describe("update", () => {
        it("overwrites a player's stats with the provided values", async () => {
            await api.create(baseStats({ name: "alice", total_hands: 1, vpip_hands: 1, pfr_hands: 1 }));
            await api.update("alice", baseStats({
                name: "alice",
                total_hands: 5,
                vpip_hands: 4,
                pfr_hands: 3,
                three_bet_hands: 1,
                three_bet_opportunities: 2,
                faced_three_bet: 1,
                folded_to_three_bet: 0,
                total_bets: 1,
                total_raises: 4,
                total_calls: 2,
                total_folds: 0,
            }));
            const row = await api.get("alice") as any;
            expect(row.total_hands).to.equal(5);
            expect(row.three_bet_hands).to.equal(1);
            expect(row.three_bet_opportunities).to.equal(2);
            expect(row.faced_three_bet).to.equal(1);
            expect(row.total_raises).to.equal(4);
        });
    });

    describe("updateMany", () => {
        it("applies all updates in a single transaction", async () => {
            await api.create(baseStats({ name: "alice" }));
            await api.create(baseStats({ name: "bob" }));

            api.updateMany([
                { player_name: "alice", player_stats_JSON: baseStats({ name: "alice", total_hands: 7, vpip_hands: 5 }) },
                { player_name: "bob", player_stats_JSON: baseStats({ name: "bob", total_hands: 4, vpip_hands: 2 }) },
            ]);

            const alice = await api.get("alice") as any;
            const bob = await api.get("bob") as any;
            expect(alice.total_hands).to.equal(7);
            expect(alice.vpip_hands).to.equal(5);
            expect(bob.total_hands).to.equal(4);
            expect(bob.vpip_hands).to.equal(2);
        });

        it("handles an empty update list as a no-op", () => {
            expect(() => api.updateMany([])).to.not.throw();
        });
    });

    describe("remove", () => {
        it("deletes the player's row", async () => {
            await api.create(baseStats({ name: "alice", total_hands: 1 }));
            await api.remove("alice");
            const row = await api.get("alice");
            expect(row).to.satisfy((v: any) => v === undefined || v === "");
        });

        it("is a no-op when the player doesn't exist", async () => {
            let threw = false;
            try {
                await api.remove("ghost");
            } catch {
                threw = true;
            }
            expect(threw).to.equal(false);
        });
    });
});
