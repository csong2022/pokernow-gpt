export class PlayerStats {
    private id: string;
    private total_hands: number;
    private walks: number;
    private vpip_count: number;
    private vpip_stat: number;
    private pfr_count: number;
    private pfr_stat: number;

    constructor(id: string) {
        this.vpip_count = 0
        this.walks = 0
        this.vpip_stat = 0
        this.pfr_count = 0
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
        return this.walks;
    }

    public getVPIPHands(): number {
        return this.vpip_count;
    }

    public setVPIPHands(vpip: number): void {
        this.vpip_count = vpip
    }

    public setVPIPStat(): void {
        var vpip:number = this.vpip_count / (this.getTotalHands() - this.getWalk());
        this.vpip_stat = vpip
    }

    public getPFRHands(): number {
        return this.pfr_count;
    }

    public setPFRHands(pfr: number): void {
        this.pfr_count = pfr
    }

    public setPFRStat(): void {
        var pfr:number = this.pfr_count / (this.getTotalHands() - this.getWalk());
        this.pfr_stat = pfr
    }
}