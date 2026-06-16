/// <reference types="mocha" />
import { expect } from "chai";

import { Game } from "../../src/core/game/game.model.ts";
import { constructHandSetup } from "../../src/core/poker/query-construction.helper.ts";
import type { HandContextBuilder } from "../../src/core/poker/hand-context-builder.interface.ts";
import { mapStateView } from "../../src/arena/state-mapper.ts";
import { InMemoryPlayerStatsRepository } from "../../src/arena/player-stats.repository.ts";
import { NoOpponentContext } from "../../src/arena/no-opponent-context.ts";
import { StatsContextBuilder } from "../../src/live/bot/stats-context-builder.ts";

const STACKS_HEADER = "Here are the initial stack sizes of the other players in the pot,";
const STATS_HEADER = "Here are the stats of the other players in the pot,";
const INSTR = "I'll send the state on each of my decision points";

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
