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
                action_str = `bets ${this.bet_amount_BBs} BB`;
                break;
            case Action.CALL:
                action_str = `calls ${this.bet_amount_BBs} BB`;
                break;
            case Action.FOLD:
                action_str = "folds";
                break;
            case Action.RAISE:
                action_str = `bets ${this.bet_amount_BBs} BB`;
                break;
            case Action.POST:
                action_str = `posts ${this.bet_amount_BBs} BB`;
                break;
            case Action.CHECK:
                action_str = "checks";
                break;
        }
        return action_str;
    }
}