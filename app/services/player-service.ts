import { query } from '../database/db-service';
import { emptyOrSingleRow } from '../utils/query-utils'

export async function get(player_id: string): Promise<string>{
    const rows = await query(
        `SELECT *
         FROM Player
         WHERE id = ?`,
         [player_id]
    )
    return emptyOrSingleRow(rows);
}