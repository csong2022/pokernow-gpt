import { DBService} from './db-service.ts';
import { emptyOrSingleRow } from '../helpers/db-query-helper.ts'

export class PlayerService {
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
             (name, total_hands, walks, vpip_hands, pfr_hands)
             VALUES
             (?, ?, ?, ?, ?)`,
             [
                player_stats_JSON.name, 
                player_stats_JSON.total_hands, 
                player_stats_JSON.walks, 
                player_stats_JSON.vpip_hands,
                player_stats_JSON.pfr_hands
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
                pfr_hands = ?
             WHERE name = ?`,
             [
                player_stats_JSON.total_hands, 
                player_stats_JSON.walks, 
                player_stats_JSON.vpip_hands,
                player_stats_JSON.pfr_hands,
                player_name
            ]
        )
    }
    
    async remove(player_name: string): Promise<void>{
        await this.db_service.query(
            `DELETE FROM PlayerStats
             WHERE name = ?`,
             [player_name]
        )
    }
}
