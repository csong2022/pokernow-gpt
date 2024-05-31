import { query } from '../database/db-service';
import { emptyOrSingleRow } from '../utils/query-utils'

export async function get(player_id: string): Promise<Array<string>>{
    console.log("PLAYER_ID " + player_id);
    const rows = await query(
        `SELECT id, total_hands
         FROM Player
         WHERE id = ?`,
         [player_id]
    )
    return emptyOrSingleRow(rows);
}