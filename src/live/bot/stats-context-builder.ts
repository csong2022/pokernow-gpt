import { Game } from "../../core/game/game.model.ts";
import type { HandContextBuilder } from "../../core/poker/hand-context-builder.interface.ts";

// Live's opponent-aware context: the VPIP/PFR/3-bet/AFq block read from the table's
// accumulated player stats (sourced from SQLite via the injected PlayerStatsRepository).
// This is the exploitative-input thesis. The string is produced exactly as it was
// when this logic lived inside query-construction, so live prompts are unchanged.
export class StatsContextBuilder implements HandContextBuilder {
    buildOpponentSection(game: Game): string {
        const table = game.getTable();
        const hero_id = game.getHero()!.getPlayerId();
        const hero_name = table.getNameFromId(hero_id);
        const player_positions = table.getPlayerPositions();

        const stat_entries: string[] = [];
        for (const player_id of player_positions.keys()) {
            if (player_id === hero_id) continue;
            const player_pos = player_positions.get(player_id);
            // Skip opponents we can't resolve (e.g. a rebought/new id not yet in the
            // current maps) rather than throwing and aborting the whole decision.
            const player_name = table.tryGetNameFromId(player_id);
            if (!player_name || player_name === hero_name) continue;

            const player_stats = table.getPlayerStatsFromName(player_name);
            stat_entries.push(
                `{${player_pos}: Total Hands Played = ${player_stats.getTotalHands()}, VPIP = ${player_stats.computeVPIPStat().toFixed(2)}, PFR = ${player_stats.computePFRStat().toFixed(2)}, 3-Bet = ${player_stats.computeThreeBetStat().toFixed(2)}, Fold-to-3-Bet = ${player_stats.computeFoldToThreeBetStat().toFixed(2)}, AFq = ${player_stats.computeAggressionFrequency().toFixed(2)}}`
            );
        }

        return "Here are the stats of the other players in the pot, defined in the format {position: Total Hands Played = total_hands, VPIP = vpip_stat, PFR = pfr_stat, 3-Bet = three_bet_stat, Fold-to-3-Bet = fold_to_three_bet_stat, AFq = aggression_frequency}:\n" + stat_entries.join("\n");
    }
}
