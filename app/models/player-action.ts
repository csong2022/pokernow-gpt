import { Action } from "../utils/log-processing-utils.ts";

export class PlayerAction {
    private player_id: string;
    private action: Action;
    private bet_amount_BBs: number;

    constructor(player_id: string, action: string, bet_amount_BBs?: number) {
        this.player_id = player_id;
        this.action = action as Action;
        if (bet_amount_BBs) {
            this.bet_amount_BBs = bet_amount_BBs;
        } else {
            this.bet_amount_BBs = 0;
        }
    }

    private toString() {
        let action_str = "";
        switch (this.action) {
            case Action.BET:
                action_str = `bet ${this.bet_amount_BBs}`
            case Action.CALL:
                action_str = `call ${this.bet_amount_BBs}`
            case Action.FOLD:
                action_str = `fold`
            case Action.RAISE:
                action_str = `bet ${this.bet_amount_BBs}`
            case Action.POST:
                action_str = `bet ${this.bet_amount_BBs}` 
            case Action.CHECK:
                action_str = `check`
        }
        return action_str;
    }
}