import { query } from '../database/db-service';
import { emptyOrSingleRow } from '../utils/query-utils'

export async function get(player_id: string): Promise<string> {
    const rows = await query(
        `SELECT *
         FROM Player
         WHERE id = ?`,
         [player_id]
    )
    return emptyOrSingleRow(rows);
}

export async function create(player_data: any): Promise<void> {
    await query(
        `INSERT INTO player
         (id, total_hands)
         VALUES
         (?, ?)`,
         [player_data.id, player_data.total_hands]
    )
}

export async function update(player_id: string, player_data: any): Promise<void> {
    await query(
        `UPDATE player
         SET total_hands = ?
         WHERE id = ?`,
         [player_data.total_hands, player_id]
    )
}

export async function remove(player_id: string): Promise<void>{
    await query(
        `DELETE FROM player
         WHERE id = ?`,
         [player_id]
    )
}