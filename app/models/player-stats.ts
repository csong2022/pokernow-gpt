export class PlayerStats {
    private id: string;
    private total_hands: number;
    private walks: number;
    private vpip_hands: number;
    private vpip_stat: number;
    private pfr_hands: number;
    private pfr_stat: number;

    constructor(id: string, player_JSON?: any) {
        this.id = id;
        if (player_JSON) {
            this.total_hands = player_JSON.total_hands;
            this.walks = player_JSON.walks;
            this.vpip_hands = player_JSON.vpip_hands;
            this.vpip_stat = player_JSON.vpip_stat;
            this.pfr_hands = player_JSON.pfr_hands;
            this.pfr_stat = player_JSON.pfr_stat;
        } else {
            this.total_hands = 0
            this.walks = 0
            this.vpip_hands = 0
            this.vpip_stat = 0
            this.pfr_hands = 0
            this.pfr_stat = 0
        }
    }

    public getId(): string {
        return this.id;
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

    public getVPIPHands(): number {
        return this.vpip_hands;
    }

    public setVPIPHands(vpip: number): void {
        this.vpip_hands = vpip
    }

    public setVPIPStat(): void {
        var vpip:number = this.vpip_hands / (this.getTotalHands() - this.getWalk());
        this.vpip_stat = vpip
    }

    public getPFRHands(): number {
        return this.pfr_hands;
    }

    public setPFRHands(pfr: number): void {
        this.pfr_hands = pfr
    }

    public setPFRStat(): void {
        var pfr:number = this.pfr_hands / (this.getTotalHands() - this.getWalk());
        this.pfr_stat = pfr
    }

    public toJSON(): any {
        return {
            "id": this.id,
            "total_hands": this.total_hands,
            "walks": this.walks,
            "vpip_hands": this.vpip_hands,
            "vpip_stat": this.vpip_stat,
            "pfr_hands": this.pfr_hands,
            "pfr_stat": this.pfr_stat
        }
    }
}