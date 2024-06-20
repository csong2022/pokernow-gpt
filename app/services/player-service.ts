import { query } from './db-service.ts';
import { emptyOrSingleRow } from '../utils/db-query-utils.ts'

export async function get(player_id: string): Promise<string> {
    const rows = await query(
        `SELECT *
         FROM PlayerStats
         WHERE id = ?`,
         [player_id]
    )
    return emptyOrSingleRow(rows);
}

export async function create(player_stats_JSON: any): Promise<void> {
    await query(
        `INSERT INTO PlayerStats
         (id, total_hands, walks, vpip_hands, vpip_stat, pfr_hands, pfr_stat)
         VALUES
         (?, ?, ?, ?, ?, ?, ?)`,
         [
            player_stats_JSON.id, 
            player_stats_JSON.total_hands, 
            player_stats_JSON.walks, 
            player_stats_JSON.vpip_hands,
            player_stats_JSON.vpip_stat,
            player_stats_JSON.pfr_hands,
            player_stats_JSON.pfr_stat
        ]
    )
}

export async function update(player_id: string, player_stats_JSON: any): Promise<void> {
    await query(
        `UPDATE PlayerStats
         SET 
            total_hands = ?,
            walks = ?,
            vpip_hands = ?,
            vpip_stat = ?,
            pfr_hands = ?,
            pfr_stat = ?
         WHERE id = ?`,
         [
            player_stats_JSON.id, 
            player_stats_JSON.total_hands, 
            player_stats_JSON.walks, 
            player_stats_JSON.vpip_hands,
            player_stats_JSON.vpip_stat,
            player_stats_JSON.pfr_hands,
            player_stats_JSON.pfr_stat
        ]
    )
}

export async function remove(player_id: string): Promise<void>{
    await query(
        `DELETE FROM PlayerStats
         WHERE id = ?`,
         [player_id]
    )
}