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
    public getPlayerId(): string {
        return this.player_id;
    }
    public getAction(): string {
        return this.action;
    }
    public getBetAmount(): number {
        return this.bet_amount_BBs;
    }

    public toString() {
        let action_str = "";
        switch (this.action) {
            case Action.BET:
                action_str = `bet ${this.bet_amount_BBs}`;
                break;
            case Action.CALL:
                action_str = `call ${this.bet_amount_BBs}`;
                break;
            case Action.FOLD:
                action_str = "fold";
                break;
            case Action.RAISE:
                action_str = `bet ${this.bet_amount_BBs}`;
                break;
            case Action.POST:
                action_str = `bet ${this.bet_amount_BBs}`;
                break;
            case Action.CHECK:
                action_str = "check";
                break;
        }
        return action_str;
    }
}