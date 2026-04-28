import { DBService } from './db.service.ts';

export interface HandOutcome {
    hand_id: string;
    bot_uuid: string;
    bot_name: string;
    model_provider: string;
    model_name: string;
    starting_stack_BB: number;
    ending_stack_BB: number;
    stack_delta_BB: number;
    position: string | null;
    saw_showdown: number;
    created_at: number;
}

export class HandOutcomesAPIService {
    private db_service: DBService;

    constructor(db_service: DBService) {
        this.db_service = db_service;
    }

    async insert(outcome: HandOutcome): Promise<void> {
        await this.db_service.query(
            `INSERT OR REPLACE INTO HandOutcomes
             (hand_id, bot_uuid, bot_name, model_provider, model_name,
              starting_stack_BB, ending_stack_BB, stack_delta_BB,
              position, saw_showdown, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                outcome.hand_id,
                outcome.bot_uuid,
                outcome.bot_name,
                outcome.model_provider,
                outcome.model_name,
                outcome.starting_stack_BB,
                outcome.ending_stack_BB,
                outcome.stack_delta_BB,
                outcome.position,
                outcome.saw_showdown,
                outcome.created_at,
            ],
        );
    }

    async getByModel(model_provider: string, model_name: string): Promise<HandOutcome[]> {
        const rows = await this.db_service.query(
            `SELECT * FROM HandOutcomes WHERE model_provider = ? AND model_name = ?`,
            [model_provider, model_name],
        );
        return rows as HandOutcome[];
    }

    async getAll(): Promise<HandOutcome[]> {
        const rows = await this.db_service.query(`SELECT * FROM HandOutcomes`, []);
        return rows as HandOutcome[];
    }
}
