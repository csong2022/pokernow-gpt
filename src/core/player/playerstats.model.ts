export class PlayerStats {
    private player_name: string;
    private total_hands: number;
    private walks: number;
    private vpip_hands: number;
    private pfr_hands: number;
    private three_bet_hands: number;
    private three_bet_opportunities: number;
    private faced_three_bet: number;
    private folded_to_three_bet: number;
    private total_bets: number;
    private total_raises: number;
    private total_calls: number;
    private total_folds: number;

    //TODO: player stats should use name not id
    //should have separate table mapping name to id in db that updates everytime new id is detected for particular name
    constructor(player_name: string, player_JSON?: any) {
        this.player_name = player_name;
        if (player_JSON) {
            this.total_hands = player_JSON.total_hands;
            this.walks = player_JSON.walks;
            this.vpip_hands = player_JSON.vpip_hands;
            this.pfr_hands = player_JSON.pfr_hands;
            this.three_bet_hands = player_JSON.three_bet_hands ?? 0;
            this.three_bet_opportunities = player_JSON.three_bet_opportunities ?? 0;
            this.faced_three_bet = player_JSON.faced_three_bet ?? 0;
            this.folded_to_three_bet = player_JSON.folded_to_three_bet ?? 0;
            this.total_bets = player_JSON.total_bets ?? 0;
            this.total_raises = player_JSON.total_raises ?? 0;
            this.total_calls = player_JSON.total_calls ?? 0;
            this.total_folds = player_JSON.total_folds ?? 0;
        } else {
            this.total_hands = 0;
            this.walks = 0;
            this.vpip_hands = 0;
            this.pfr_hands = 0;
            this.three_bet_hands = 0;
            this.three_bet_opportunities = 0;
            this.faced_three_bet = 0;
            this.folded_to_three_bet = 0;
            this.total_bets = 0;
            this.total_raises = 0;
            this.total_calls = 0;
            this.total_folds = 0;
        }
    }

    public getName(): string {
        return this.player_name;
    }

    public getTotalHands(): number {
        return this.total_hands;
    }

    public setTotalHands(total_hands: number): void {
        this.total_hands = total_hands;
    }

    public getWalk(): number {
        return this.walks;
    }

    public incrementWalks(): void {
        this.walks += 1;
    }

    public getVPIPHands(): number {
        return this.vpip_hands;
    }

    public setVPIPHands(vpip: number): void {
        this.vpip_hands = vpip
    }

    public computeVPIPStat(): number {
        if (this.total_hands - this.walks == 0) {
            return 0;
        }
        return this.vpip_hands / (this.total_hands - this.walks) * 100;
    }

    public getPFRHands(): number {
        return this.pfr_hands;
    }

    public setPFRHands(pfr: number): void {
        this.pfr_hands = pfr
    }

    public computePFRStat(): number {
        if (this.total_hands - this.walks == 0) {
            return 0;
        }
        return this.pfr_hands / (this.total_hands - this.walks) * 100;
    }

    public getThreeBetHands(): number {
        return this.three_bet_hands;
    }

    public setThreeBetHands(three_bet_hands: number): void {
        this.three_bet_hands = three_bet_hands;
    }

    public getThreeBetOpportunities(): number {
        return this.three_bet_opportunities;
    }

    public setThreeBetOpportunities(three_bet_opportunities: number): void {
        this.three_bet_opportunities = three_bet_opportunities;
    }

    public computeThreeBetStat(): number {
        if (this.three_bet_opportunities == 0) {
            return 0;
        }
        return this.three_bet_hands / this.three_bet_opportunities * 100;
    }

    public getFacedThreeBet(): number {
        return this.faced_three_bet;
    }

    public setFacedThreeBet(faced_three_bet: number): void {
        this.faced_three_bet = faced_three_bet;
    }

    public getFoldedToThreeBet(): number {
        return this.folded_to_three_bet;
    }

    public setFoldedToThreeBet(folded_to_three_bet: number): void {
        this.folded_to_three_bet = folded_to_three_bet;
    }

    public computeFoldToThreeBetStat(): number {
        if (this.faced_three_bet == 0) {
            return 0;
        }
        return this.folded_to_three_bet / this.faced_three_bet * 100;
    }

    public getTotalBets(): number {
        return this.total_bets;
    }

    public setTotalBets(total_bets: number): void {
        this.total_bets = total_bets;
    }

    public getTotalRaises(): number {
        return this.total_raises;
    }

    public setTotalRaises(total_raises: number): void {
        this.total_raises = total_raises;
    }

    public getTotalCalls(): number {
        return this.total_calls;
    }

    public setTotalCalls(total_calls: number): void {
        this.total_calls = total_calls;
    }

    public getTotalFolds(): number {
        return this.total_folds;
    }

    public setTotalFolds(total_folds: number): void {
        this.total_folds = total_folds;
    }

    public computeAggressionFrequency(): number {
        const denom = this.total_bets + this.total_raises + this.total_calls + this.total_folds;
        if (denom == 0) {
            return 0;
        }
        return (this.total_bets + this.total_raises) / denom * 100;
    }

    public toJSON(): any {
        return {
            "name": this.player_name,
            "total_hands": this.total_hands,
            "walks": this.walks,
            "vpip_hands": this.vpip_hands,
            "pfr_hands": this.pfr_hands,
            "three_bet_hands": this.three_bet_hands,
            "three_bet_opportunities": this.three_bet_opportunities,
            "faced_three_bet": this.faced_three_bet,
            "folded_to_three_bet": this.folded_to_three_bet,
            "total_bets": this.total_bets,
            "total_raises": this.total_raises,
            "total_calls": this.total_calls,
            "total_folds": this.total_folds,
        }
    }
}
