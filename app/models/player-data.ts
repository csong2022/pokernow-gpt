export class PlayerData {
    private id: string;
    private total_hands: number;
    private vpip_hands: number;
    private walk: number;
    private vpip_stat: number;
    private pfr_hands: number;
    private pfr_stat: number;

    constructor(id: string) {
        this.vpip_hands = 0
        this.walk = 0
        this.vpip_stat = 0
        this.pfr_hands = 0
        this.pfr_stat = 0
        this.id = id;
        this.total_hands = 0
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
        return this.walk;
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
}