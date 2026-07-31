import { Game } from './game.model.ts';
import { Table } from './table.model.ts';
import { ProcessedLogs } from '../poker/log-processing.interface.ts';

export class HandState {
    active: boolean = true;
    readonly bot_uuid: string;
    readonly model_provider: string;
    readonly model_name: string;
    readonly game_id: string;
    bot_name: string = "";
    hand_number: number = 1;
    first_created: string = "";
    is_first_turn_of_hand: boolean = true;
    is_dealer: boolean = false;
    between_hands: boolean = true;
    processed_logs: ProcessedLogs = { valid_msgs: [], last_created: "", first_fetch: true };
    game!: Game;
    table!: Table;

    constructor(bot_uuid: string, model_provider: string, model_name: string, game_id: string) {
        this.bot_uuid = bot_uuid;
        this.model_provider = model_provider;
        this.model_name = model_name;
        this.game_id = game_id;
    }
}
