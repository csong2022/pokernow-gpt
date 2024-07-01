import { DBService} from './db-service.ts';
import { emptyOrSingleRow } from '../utils/db-query-utils.ts'

export class PlayerService {
    private db_service: DBService;

    constructor(db_service: DBService) {
        this.db_service = db_service;
    }

    async get(player_id: string): Promise<string> {
        const rows = await this.db_service.query(
            `SELECT *
             FROM PlayerStats
             WHERE id = ?`,
             [player_id]
        )
        return emptyOrSingleRow(rows);
    }
    
    async create(player_stats_JSON: any): Promise<void> {
        await this.db_service.query(
            `INSERT INTO PlayerStats
             (id, total_hands, walks, vpip_hands, pfr_hands)
             VALUES
             (?, ?, ?, ?, ?)`,
             [
                player_stats_JSON.id, 
                player_stats_JSON.total_hands, 
                player_stats_JSON.walks, 
                player_stats_JSON.vpip_hands,
                player_stats_JSON.pfr_hands
            ]
        )
    }
    
    async update(player_id: string, player_stats_JSON: any): Promise<void> {
        await this.db_service.query(
            `UPDATE PlayerStats
             SET 
                total_hands = ?,
                walks = ?,
                vpip_hands = ?,
                pfr_hands = ?
             WHERE id = ?`,
             [
                player_stats_JSON.total_hands, 
                player_stats_JSON.walks, 
                player_stats_JSON.vpip_hands,
                player_stats_JSON.pfr_hands,
                player_id
            ]
        )
    }
    
    async remove(player_id: string): Promise<void>{
        await this.db_service.query(
            `DELETE FROM PlayerStats
             WHERE id = ?`,
             [player_id]
        )
    }
}
