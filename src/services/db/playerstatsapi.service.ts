import { DBService } from './db.service.ts';
import { emptyOrSingleRow } from './db-query.helper.ts'

// handles player related queries
export class PlayerStatsAPIService {
    private db_service: DBService;

    constructor(db_service: DBService) {
        this.db_service = db_service;
    }

    async get(player_name: string): Promise<string> {
        const rows = await this.db_service.query(
            `SELECT *
             FROM PlayerStats
             WHERE name = ?`,
             [player_name]
        )
        return emptyOrSingleRow(rows);
    }
    
    async create(player_stats_JSON: any): Promise<void> {
        await this.db_service.query(
            `INSERT INTO PlayerStats
             (name, total_hands, walks, vpip_hands, pfr_hands, three_bet_hands, three_bet_opportunities, faced_three_bet, folded_to_three_bet, total_bets, total_raises, total_calls, total_folds)
             VALUES
             (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
             [
                player_stats_JSON.name,
                player_stats_JSON.total_hands,
                player_stats_JSON.walks,
                player_stats_JSON.vpip_hands,
                player_stats_JSON.pfr_hands,
                player_stats_JSON.three_bet_hands,
                player_stats_JSON.three_bet_opportunities,
                player_stats_JSON.faced_three_bet,
                player_stats_JSON.folded_to_three_bet,
                player_stats_JSON.total_bets,
                player_stats_JSON.total_raises,
                player_stats_JSON.total_calls,
                player_stats_JSON.total_folds
            ]
        )
    }

    async update(player_name: string, player_stats_JSON: any): Promise<void> {
        await this.db_service.query(
            `UPDATE PlayerStats
             SET
                total_hands = ?,
                walks = ?,
                vpip_hands = ?,
                pfr_hands = ?,
                three_bet_hands = ?,
                three_bet_opportunities = ?,
                faced_three_bet = ?,
                folded_to_three_bet = ?,
                total_bets = ?,
                total_raises = ?,
                total_calls = ?,
                total_folds = ?
             WHERE name = ?`,
             [
                player_stats_JSON.total_hands,
                player_stats_JSON.walks,
                player_stats_JSON.vpip_hands,
                player_stats_JSON.pfr_hands,
                player_stats_JSON.three_bet_hands,
                player_stats_JSON.three_bet_opportunities,
                player_stats_JSON.faced_three_bet,
                player_stats_JSON.folded_to_three_bet,
                player_stats_JSON.total_bets,
                player_stats_JSON.total_raises,
                player_stats_JSON.total_calls,
                player_stats_JSON.total_folds,
                player_name
            ]
        )
    }

    updateMany(updates: Array<{ player_name: string, player_stats_JSON: any }>): void {
        this.db_service.transaction(() => {
            for (const { player_name, player_stats_JSON } of updates) {
                this.db_service.query(
                    `UPDATE PlayerStats
                     SET
                        total_hands = ?,
                        walks = ?,
                        vpip_hands = ?,
                        pfr_hands = ?,
                        three_bet_hands = ?,
                        three_bet_opportunities = ?,
                        faced_three_bet = ?,
                        folded_to_three_bet = ?,
                        total_bets = ?,
                        total_raises = ?,
                        total_calls = ?,
                        total_folds = ?
                     WHERE name = ?`,
                     [
                        player_stats_JSON.total_hands,
                        player_stats_JSON.walks,
                        player_stats_JSON.vpip_hands,
                        player_stats_JSON.pfr_hands,
                        player_stats_JSON.three_bet_hands,
                        player_stats_JSON.three_bet_opportunities,
                        player_stats_JSON.faced_three_bet,
                        player_stats_JSON.folded_to_three_bet,
                        player_stats_JSON.total_bets,
                        player_stats_JSON.total_raises,
                        player_stats_JSON.total_calls,
                        player_stats_JSON.total_folds,
                        player_name
                    ]
                );
            }
        });
    }
    
    async remove(player_name: string): Promise<void>{
        await this.db_service.query(
            `DELETE FROM PlayerStats
             WHERE name = ?`,
             [player_name]
        )
    }
}