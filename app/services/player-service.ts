import { query } from '../database/db-service';
import { emptyOrSingleRow } from '../utils/query-utils'
import { PlayerData } from '../models/player-data'

export async function get(player_id: string): Promise<string> {
    const rows = await query(
        `SELECT *
         FROM Player
         WHERE id = ?`,
         [player_id]
    )
    return emptyOrSingleRow(rows);
}

export async function create(player_data: PlayerData): Promise<void> {
    await query(
        `INSERT INTO player
         (id, total_hands)
         VALUES
         (?, ?)`,
         [player_data.getId(), player_data.getTotalHands()]
    )
}