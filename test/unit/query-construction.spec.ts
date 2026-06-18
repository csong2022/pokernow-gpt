/// <reference types="mocha" />
import { expect } from "chai";

import { Game } from "../../src/core/game/game.model.ts";
import { Table } from "../../src/core/game/table.model.ts";
import { constructHandSetup, constructTurnUpdate } from "../../src/core/poker/query-construction.helper.ts";
import type { HandContextBuilder } from "../../src/core/poker/hand-context-builder.interface.ts";
import { mapStateView } from "../../src/arena/state-mapper.ts";
import { InMemoryPlayerStatsRepository } from "../../src/arena/player-stats.repository.ts";
import { NoOpponentContext } from "../../src/arena/no-opponent-context.ts";
import { StatsContextBuilder } from "../../src/live/bot/stats-context-builder.ts";

const STACKS_HEADER = "Here are the initial stack sizes of the other players in the pot,";
const STATS_HEADER = "Here are the stats of the other players in the pot,";
const INSTR = "I'll send the state at each of your decision points";

// Minimal heads-up state_view; mapStateView turns it into a real core Game/Table
// exactly as the arena does, so we exercise the shared query-construction path.
function view(): any {
    return {
        game_id: "t", street_index: 0, actor_index: 0, player_count: 2,
        button: 0, sb_index: 0, bb_index: 1, small_blind: 1, big_blind: 2,
        stacks: [200, 200], board: [], hole_cards: [["Ah", "Kh"], ["2c", "2d"]],
        starting_stacks: [200, 200], total_pot: 3, legal_actions: null, actions: [],
    };
}

// Seat1 (the opponent) stats chosen to yield exact, round percentages:
// VPIP 5/10=50, PFR 3/10=30, 3-Bet 1/4=25, Fold-to-3-Bet 1/2=50,
// AFq (2+3)/(2+3+4+1)=50.
const OPP_STATS = {
    name: "Seat1", total_hands: 10, walks: 0, vpip_hands: 5, pfr_hands: 3,
    three_bet_hands: 1, three_bet_opportunities: 4, faced_three_bet: 2, folded_to_three_bet: 1,
    total_bets: 2, total_raises: 3, total_calls: 4, total_folds: 1,
};

async function gameWithStats(): Promise<Game> {
    const repo = new InMemoryPlayerStatsRepository();
    await repo.create(OPP_STATS);
    return mapStateView(view(), 0, repo);
}

describe("query-construction context-builder seam", () => {
    it("live StatsContextBuilder reproduces the VPIP/PFR stats block byte-for-byte", async () => {
        const game = await gameWithStats();
        const oppPos = game.getTable().getPlayerPositionFromId("1");
        const expected =
            "Here are the stats of the other players in the pot, defined in the format {position: Total Hands Played = total_hands, VPIP = vpip_stat, PFR = pfr_stat, 3-Bet = three_bet_stat, Fold-to-3-Bet = fold_to_three_bet_stat, AFq = aggression_frequency}:\n" +
            `{${oppPos}: Total Hands Played = 10, VPIP = 50.00, PFR = 30.00, 3-Bet = 25.00, Fold-to-3-Bet = 50.00, AFq = 50.00}`;
        expect(new StatsContextBuilder().buildOpponentSection(game)).to.equal(expected);
    });

    it("hand setup with the live builder includes the stats block after stacks, before instructions", async () => {
        const game = await gameWithStats();
        const out = constructHandSetup(game, new StatsContextBuilder());
        const stacksIdx = out.indexOf(STACKS_HEADER);
        const statsIdx = out.indexOf(STATS_HEADER);
        const instrIdx = out.indexOf(INSTR);
        expect(stacksIdx).to.be.greaterThan(-1);
        expect(statsIdx).to.be.greaterThan(stacksIdx);
        expect(instrIdx).to.be.greaterThan(statsIdx);
    });

    it("arena NoOpponentContext emits no opponent section, structurally", async () => {
        const game = await gameWithStats();
        expect(new NoOpponentContext().buildOpponentSection(game)).to.equal("");
        const out = constructHandSetup(game, new NoOpponentContext());
        expect(out).to.not.contain(STATS_HEADER);   // no opponent history at all
        expect(out).to.contain(STACKS_HEADER);       // current-state stacks still present
        expect(out).to.contain(INSTR);
    });

    it("constructHandSetup inserts the builder output between stacks and instructions", async () => {
        const game = await gameWithStats();
        const stub: HandContextBuilder = { buildOpponentSection: () => "OPP_BLOCK_MARKER" };
        const out = constructHandSetup(game, stub);
        const stacksIdx = out.indexOf(STACKS_HEADER);
        const oppIdx = out.indexOf("OPP_BLOCK_MARKER");
        const instrIdx = out.indexOf(INSTR);
        expect(stacksIdx).to.be.lessThan(oppIdx);
        expect(oppIdx).to.be.lessThan(instrIdx);
    });
});

describe("constructTurnUpdate betting context (amount-to-call)", () => {
    // big_blind = 2 chips, so toBB = chips / 2.
    const legal = (extra: any) => ({ fold: true, check_call: true, check_call_amount: 0, raise: true, min: 8, max: 200, ...extra });
    const viewWith = (la: any): any => ({ ...view(), legal_actions: la });
    const repo = () => new InMemoryPlayerStatsRepository();

    it("states the exact amount to call when the environment supplies it", async () => {
        const game = await mapStateView(viewWith(legal({ check_call_amount: 4 })), 0, repo()); // 4 chips / 2 = 2 BB
        expect(constructTurnUpdate(game)).to.contain("To call: 2 BB.");
    });

    it("labels a raise as 'raises to X BB' (not 'bets'), disambiguating 3-bets", async () => {
        const v = { ...viewWith(legal({ check_call_amount: 6 })), actions: [{ seat: 1, type: "raises", amount: 10, street_index: 0 }] };
        const out = constructTurnUpdate(await mapStateView(v, 0, repo())); // 10 chips / 2 = 5 BB
        expect(out).to.contain("raises to 5 BB");
        expect(out).to.not.contain("bets 5 BB");
    });

    it("states the legal raise band (min/max total) when raising is allowed", async () => {
        const game = await mapStateView(viewWith(legal({ check_call_amount: 4, min: 8, max: 200 })), 0, repo());
        // 8/2=4, 200/2=100
        expect(constructTurnUpdate(game)).to.contain("If raising, the total must be between 4 and 100 BB.");
    });

    it("omits the raise band when raising is illegal", async () => {
        const game = await mapStateView(viewWith(legal({ raise: false, min: null, max: null })), 0, repo());
        expect(constructTurnUpdate(game)).to.not.contain("If raising");
    });

    it("omits the to-call line when facing no bet (check spot)", async () => {
        const game = await mapStateView(viewWith(legal({ check_call_amount: 0 })), 0, repo());
        expect(constructTurnUpdate(game)).to.not.contain("To call:");
    });

    it("shows opponents' current stacks when supplied (arena)", async () => {
        // hero seat0 has 198 chips, opp seat1 has 190 -> 99 / 95 BB
        const v = { ...viewWith(legal({ check_call_amount: 4 })), stacks: [198, 190] };
        const game = await mapStateView(v, 0, repo());
        const out = constructTurnUpdate(game);
        const oppPos = game.getTable().getPlayerPositionFromId("1");
        expect(out).to.contain(`Opponent stacks now: {${oppPos}: 95 BB}`);
        expect(out).to.not.contain("Players still in"); // HU: not shown (implied)
    });

    it("3-max: lists live players and excludes folded opponents from stacks", async () => {
        const v3: any = {
            game_id: "t3", street_index: 0, actor_index: 2, player_count: 3, button: 2, sb_index: 0, bb_index: 1,
            small_blind: 1, big_blind: 2, stacks: [198, 200, 200], board: [], hole_cards: [["Ah", "Kh"], ["2c", "2d"], ["Qs", "Js"]],
            starting_stacks: [200, 200, 200], total_pot: 3,
            legal_actions: legal({ check_call_amount: 2 }),
            actions: [{ seat: 1, type: "folds", amount: 0, street_index: 0 }], // BB folded
        };
        const game = await mapStateView(v3, 2, repo()); // hero = seat2 (BU)
        const out = constructTurnUpdate(game);
        expect(out).to.contain("Players still in the hand: SB, BU.");      // BB folded out
        expect(out).to.contain("Opponent stacks now: {SB: 99 BB}");        // live opp only
        expect(out).to.not.contain("BB:");                                  // folded opp excluded
    });

    it("omits betting context AND opponent stacks when none is provided (live path, unchanged)", async () => {
        // Build the Table the way the LIVE state-builder does — it never calls the
        // new setBettingContext/setCurrentStacks — so the new prompt lines are absent.
        const game = await liveLikeGame();
        const t = game.getTable();
        expect(t.getAmountToCall()).to.equal(null);
        expect(t.getMinRaiseTo()).to.equal(null);
        expect(t.getCurrentStacks()).to.equal(null);
        expect(t.getLivePlayers()).to.equal(null);
        const out = constructTurnUpdate(game);
        expect(out).to.not.contain("To call:");
        expect(out).to.not.contain("If raising");
        expect(out).to.not.contain("Opponent stacks now:");
        expect(out).to.not.contain("Players still in");
    });
});

// Builds a HU Game the way live does (names/positions/initial stacks/pot/hero) but
// WITHOUT the new betting-context / current-stack setters — the live path today.
async function liveLikeGame(): Promise<Game> {
    const table = new Table(new InMemoryPlayerStatsRepository());
    table.setNumPlayers(2);
    table.setIdToName(new Map([["0", "Seat0"], ["1", "Seat1"]]));
    table.setNameToId(new Map([["Seat0", "0"], ["Seat1", "1"]]));
    table.setIdToTableSeat(new Map([["0", 1], ["1", 2]]));
    table.setTableSeatToId(new Map([[1, "0"], [2, "1"]]));
    table.setIdToStack(new Map([["0", 100], ["1", 100]]));
    await table.updateCache();
    table.setIdToPosition(1);
    table.convertAllOrdersToPosition();
    table.setStreet("");
    table.setPot(3);
    table.setRunout("");
    const game = new Game("t", table, 1, 0.5, "No Limit Hold'em", 0);
    game.createAndSetHero("0", ["Ah", "Kh"], 100);
    return game;
}

import { PlayerAction } from "../../src/core/player/playeraction.model.ts";

// A player who rebuys (or joins) gets a NEW id that isn't in the maps until the next
// "Player stacks" refresh. Prompt construction must tolerate that (skip the player)
// instead of throwing and forcing a fallback decision.
describe("query-construction tolerates unresolved player ids (rebuy/new id)", () => {
    // Count only data rows ("...Played = 10"), not the header ("...Played = total_hands").
    const countStatRows = (s: string) => (s.match(/Total Hands Played = \d/g) || []).length;

    it("Table.tryGet* return undefined for an unknown id", async () => {
        const t = (await gameWithStats()).getTable();
        expect(t.tryGetNameFromId("nope")).to.equal(undefined);
        expect(t.tryGetPositionFromId("nope")).to.equal(undefined);
    });

    it("StatsContextBuilder skips an opponent in positions but not the name map", async () => {
        const game = await gameWithStats();
        game.getTable().getPlayerPositions().set("ghost", "BB"); // rebought/new id, no name yet
        const build = () => new StatsContextBuilder().buildOpponentSection(game);
        expect(build).to.not.throw();
        expect(countStatRows(build())).to.equal(1); // only the resolvable opponent, ghost omitted
    });

    it("constructHandSetup with the live builder doesn't throw on an unresolved opponent", async () => {
        const game = await gameWithStats();
        game.getTable().getPlayerPositions().set("ghost", "BB");
        expect(() => constructHandSetup(game, new StatsContextBuilder())).to.not.throw();
    });

    it("constructTurnUpdate omits actions from an unmapped (rebought) id, keeps mapped ones", async () => {
        const game = await gameWithStats();
        const oppPos = game.getTable().getPlayerPositionFromId("1");
        game.getTable().updatePlayerActions(new PlayerAction("1", "raises", 3));     // mapped opponent
        game.getTable().updatePlayerActions(new PlayerAction("rebuy_new", "calls", 1)); // unmapped new id
        let out = "";
        expect(() => { out = constructTurnUpdate(game); }).to.not.throw();
        expect(out).to.contain(`{${oppPos} raises to 3 BB}`); // mapped action kept
        expect(out).to.not.contain("rebuy_new");                // unmapped action dropped, no crash
    });
});
