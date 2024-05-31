import * as db from '../database/db-service';
import { emptyOrSingleRow } from '../utils/query-utils'

export async function get(player_id: string): Promise<Array<string>>{
    const rows = await db.query(
        `SELECT id, total_hands
         FROM Player
         WHERE id = ?`,
         [player_id]
    )
    return emptyOrSingleRow(rows);
}