import { query } from './db-service.ts';
import { emptyOrSingleRow } from '../utils/db-query-utils.ts'

export async function get(player_id: string): Promise<string> {
    const rows = await query(
        `SELECT *
         FROM Player
         WHERE id = ?`,
         [player_id]
    )
    return emptyOrSingleRow(rows);
}

export async function create(player_stats: any): Promise<void> {
    await query(
        `INSERT INTO player
         (id, total_hands, walks, vpip_hands, vpip_stat, pfr_hands, pfr_stat)
         VALUES
         (?, ?, ?, ?, ?, ?, ?)`,
         [
            player_stats.id, 
            player_stats.total_hands, 
            player_stats.walks, 
            player_stats.vpip_hands,
            player_stats.vpip_stat,
            player_stats.pfr_hands,
            player_stats.pfr_stat
        ]
    )
}

export async function update(player_id: string, player_stats: any): Promise<void> {
    await query(
        `UPDATE player
         SET 
            total_hands = ?,
            walks = ?,
            vpip_hands = ?,
            vpip_stat = ?,
            pfr_hands = ?,
            pfr_stat = ?
         WHERE id = ?`,
         [
            player_stats.id, 
            player_stats.total_hands, 
            player_stats.walks, 
            player_stats.vpip_hands,
            player_stats.vpip_stat,
            player_stats.pfr_hands,
            player_stats.pfr_stat
        ]
    )
}

export async function remove(player_id: string): Promise<void>{
    await query(
        `DELETE FROM player
         WHERE id = ?`,
         [player_id]
    )
}