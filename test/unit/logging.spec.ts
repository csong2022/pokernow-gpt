/// <reference types="mocha" />
import { expect } from "chai";

import { Game } from "../../src/core/game/game.model.ts";
import { Table } from "../../src/core/game/table.model.ts";
import { postProcessLogsAfterHand, Action, Street } from "../../src/core/poker/log-processing.util.ts";
import { LogService } from "../../src/services/logs/log.service.ts";
import { DBService } from "../../src/services/db/db.service.ts";
import { PlayerStatsAPIService } from "../../src/services/db/playerstatsapi.service.ts";
import { DebugMode, logResponse, SUCCESS_RESPONSE, ERROR_RESPONSE } from "../../src/utils/error-handling.util.ts";

const SB_ID = "sb-id";
const BB_ID = "bb-id";
const UTG_ID = "utg-id";

const post = (id: string, amount: number) => [id, "name-" + id, Action.POST, `posts ${amount}`, String(amount)];
const raise = (id: string, total: number) => [id, "name-" + id, Action.RAISE, `raises to ${total}`, String(total)];
const bet = (id: string, amount: number) => [id, "name-" + id, Action.BET, `bets ${amount}`, String(amount)];
const call = (id: string, amount: number) => [id, "name-" + id, Action.CALL, `calls ${amount}`, String(amount)];
const fold = (id: string) => [id, "name-" + id, Action.FOLD, "folds", ""];
const check = (id: string) => [id, "name-" + id, Action.CHECK, "checks", ""];
const streetMarker = (street: Street, runout = "") => [street, runout];

const newGame = (): { game: Game, table: Table, db: DBService } => {
    const db = new DBService(":memory:");
    db.init();
    db.createTables();
    const api = new PlayerStatsAPIService(db);
    const table = new Table(api);
    const game = new Game("test-game", table, 20, 10, "NLH", 30);
    return { game, table, db };
};

describe("LogService data helpers", () => {
    const svc = new LogService("test-game");

    describe("getData", () => {
        it("normalizes API entries into the Data shape with created_at", () => {
            const data = svc.getData({ data: [
                { msg: "first", createdAt: "100" },
                { msg: "second", createdAt: "200" },
            ]});
            expect(data.logs).to.have.length(2);
            expect(data.logs[0]).to.include({ msg: "first", created_at: "100" });
            expect(data.logs[1]).to.include({ msg: "second", created_at: "200" });
        });

        it("returns an empty logs array when data is missing", () => {
            const data = svc.getData({});
            expect(data.logs).to.deep.equal([]);
        });
    });

    describe("getMsg / getCreatedAt", () => {
        const data = {
            logs: [
                { at: "", created_at: "300", msg: "newest" },
                { at: "", created_at: "200", msg: "middle" },
                { at: "", created_at: "100", msg: "oldest" },
            ],
        };

        it("getMsg returns msg strings in original order", () => {
            expect(svc.getMsg(data)).to.deep.equal(["newest", "middle", "oldest"]);
        });

        it("getCreatedAt returns timestamps in original order", () => {
            expect(svc.getCreatedAt(data)).to.deep.equal(["300", "200", "100"]);
        });

        it("getFirst returns the first element (newest in API order)", () => {
            expect(svc.getFirst(svc.getCreatedAt(data))).to.equal("300");
        });

        it("getLast returns the last element (oldest in API order)", () => {
            expect(svc.getLast(svc.getCreatedAt(data))).to.equal("100");
        });
    });

    describe("pruneLogsBeforeCurrentHand", () => {
        it("keeps logs through the starting hand marker", () => {
            const data = {
                logs: [
                    { at: "", created_at: "5", msg: "BB folds" },
                    { at: "", created_at: "4", msg: "SB raises to 3" },
                    { at: "", created_at: "3", msg: "BB posts a big blind of 1" },
                    { at: "", created_at: "2", msg: "SB posts a small blind of 0.5" },
                    { at: "", created_at: "1", msg: "-- starting hand #5 (id: abc) --" },
                    { at: "", created_at: "0", msg: "previous hand log that should be pruned" },
                ],
            };
            const pruned = svc.pruneLogsBeforeCurrentHand(data);
            expect(pruned.logs).to.have.length(5);
            expect(pruned.logs[pruned.logs.length - 1].msg).to.include("starting hand #5");
        });

        it("returns an empty logs array when input is empty (no crash)", () => {
            const pruned = svc.pruneLogsBeforeCurrentHand({ logs: [] });
            expect(pruned.logs).to.deep.equal([]);
        });

        it("returns the original logs (without an undefined marker) when no starting hand entry exists", () => {
            const data = {
                logs: [
                    { at: "", created_at: "2", msg: "some action" },
                    { at: "", created_at: "1", msg: "other action" },
                ],
            };
            const pruned = svc.pruneLogsBeforeCurrentHand(data);
            // No undefined entries — the recent crash fix must hold.
            for (const entry of pruned.logs) {
                expect(entry).to.not.be.undefined;
                expect(entry.msg).to.be.a("string");
            }
        });
    });
});

describe("logResponse", () => {
    const success = { code: SUCCESS_RESPONSE as typeof SUCCESS_RESPONSE, data: null, msg: "ok" };
    const failure = { code: ERROR_RESPONSE as typeof ERROR_RESPONSE, error: new Error("boom") };

    it("returns the response code on success", () => {
        expect(logResponse(success, DebugMode.NOLOG)).to.equal(SUCCESS_RESPONSE);
    });

    it("returns the response code on error", () => {
        expect(logResponse(failure, DebugMode.NOLOG)).to.equal(ERROR_RESPONSE);
    });

    it("does not throw under DebugMode.CONSOLE", () => {
        expect(() => logResponse(success, DebugMode.CONSOLE)).to.not.throw();
        expect(() => logResponse(failure, DebugMode.CONSOLE)).to.not.throw();
    });
});

describe("postProcessLogsAfterHand — action counting", () => {
    it("counts bets, raises, calls, and folds per player across all streets", async () => {
        const { game, table, db } = newGame();
        try {
            const logs = [
                post(SB_ID, 0.5),
                post(BB_ID, 1),
                raise(SB_ID, 3),
                call(BB_ID, 3),
                streetMarker(Street.FLOP, "7c 5d 5h"),
                bet(BB_ID, 5),
                call(SB_ID, 5),
                streetMarker(Street.TURN, "7c 5d 5h 4h"),
                check(BB_ID),
                check(SB_ID),
                streetMarker(Street.RIVER, "7c 5d 5h 4h 5c"),
                check(BB_ID),
                fold(SB_ID),
            ];
            await postProcessLogsAfterHand(logs, game);

            const sb_counts = table.getActionCounts(SB_ID);
            expect(sb_counts).to.deep.equal({ bets: 0, raises: 1, calls: 1, folds: 1 });

            const bb_counts = table.getActionCounts(BB_ID);
            expect(bb_counts).to.deep.equal({ bets: 1, raises: 0, calls: 1, folds: 0 });
        } finally {
            db.close();
        }
    });
});

describe("postProcessLogsAfterHand — preflop aggression detection", () => {
    it("records an opener with no 3-bet (everyone folds)", async () => {
        const { game, table, db } = newGame();
        try {
            await postProcessLogsAfterHand([
                post(SB_ID, 0.5),
                post(BB_ID, 1),
                raise(UTG_ID, 3),
                fold(SB_ID),
                fold(BB_ID),
            ], game);

            // SB and BB both had a 3-bet opportunity (facing one open) but didn't take it.
            expect(table.hadThreeBetOpportunity(SB_ID)).to.equal(true);
            expect(table.hadThreeBetOpportunity(BB_ID)).to.equal(true);
            expect(table.didThreeBet(SB_ID)).to.equal(false);
            expect(table.didThreeBet(BB_ID)).to.equal(false);

            // No 3-bet happened, so no faced/folded events
            expect(table.facedThreeBet(UTG_ID)).to.equal(false);
            expect(table.foldedToThreeBet(UTG_ID)).to.equal(false);
        } finally {
            db.close();
        }
    });

    it("records the 3-better and the opener faced/folded when opener folds to 3-bet", async () => {
        const { game, table, db } = newGame();
        try {
            await postProcessLogsAfterHand([
                post(SB_ID, 0.5),
                post(BB_ID, 1),
                raise(SB_ID, 3),
                raise(BB_ID, 9),
                fold(SB_ID),
            ], game);

            expect(table.hadThreeBetOpportunity(BB_ID)).to.equal(true);
            expect(table.didThreeBet(BB_ID)).to.equal(true);

            expect(table.facedThreeBet(SB_ID)).to.equal(true);
            expect(table.foldedToThreeBet(SB_ID)).to.equal(true);
        } finally {
            db.close();
        }
    });

    it("records faced-3-bet but not folded when opener calls the 3-bet", async () => {
        const { game, table, db } = newGame();
        try {
            await postProcessLogsAfterHand([
                post(SB_ID, 0.5),
                post(BB_ID, 1),
                raise(SB_ID, 3),
                raise(BB_ID, 9),
                call(SB_ID, 9),
            ], game);

            expect(table.didThreeBet(BB_ID)).to.equal(true);
            expect(table.facedThreeBet(SB_ID)).to.equal(true);
            expect(table.foldedToThreeBet(SB_ID)).to.equal(false);
        } finally {
            db.close();
        }
    });

    it("does not count 4-bets as 3-bets", async () => {
        const { game, table, db } = newGame();
        try {
            await postProcessLogsAfterHand([
                post(SB_ID, 0.5),
                post(BB_ID, 1),
                raise(SB_ID, 3),
                raise(BB_ID, 9),
                raise(SB_ID, 27), // 4-bet
                fold(BB_ID),
            ], game);

            // BB 3-bet
            expect(table.didThreeBet(BB_ID)).to.equal(true);
            // SB faced the 3-bet and didn't fold (4-bet instead)
            expect(table.facedThreeBet(SB_ID)).to.equal(true);
            expect(table.foldedToThreeBet(SB_ID)).to.equal(false);
            // SB's 4-bet must NOT be tracked as a 3-bet event for SB
            expect(table.didThreeBet(SB_ID)).to.equal(false);
        } finally {
            db.close();
        }
    });

    it("ignores postflop raises (3-bet detection is preflop-only)", async () => {
        const { game, table, db } = newGame();
        try {
            await postProcessLogsAfterHand([
                post(SB_ID, 0.5),
                post(BB_ID, 1),
                raise(SB_ID, 3),
                call(BB_ID, 3),
                streetMarker(Street.FLOP, "7c 5d 5h"),
                bet(BB_ID, 5),
                raise(SB_ID, 15), // postflop raise — must NOT be a 3-bet event
            ], game);

            expect(table.didThreeBet(SB_ID)).to.equal(false);
            expect(table.didThreeBet(BB_ID)).to.equal(false);
            expect(table.facedThreeBet(BB_ID)).to.equal(false);
        } finally {
            db.close();
        }
    });
});
