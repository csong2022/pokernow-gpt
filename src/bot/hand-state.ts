import { Game } from '../core/game/game.model.ts';
import { Table } from '../core/game/table.model.ts';
import { ProcessedLogs } from '../core/poker/log-processing.interface.ts';

export class HandState {
    active: boolean = true;
    bot_name: string = "";
    hand_number: number = 1;
    first_created: string = "";
    is_first_turn_of_hand: boolean = true;
    is_dealer: boolean = false;
    between_hands: boolean = true;
    processed_logs: ProcessedLogs = { valid_msgs: [], last_created: "", first_fetch: true };
    game!: Game;
    table!: Table;
}
