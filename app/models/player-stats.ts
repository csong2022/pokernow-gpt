export class PlayerStats {
    private id: string;
    private total_hands: number;
    private walks: number;
    private vpip_hands: number;
    private pfr_hands: number;

    constructor(id: string, player_JSON?: any) {
        this.id = id;
        if (player_JSON) {
            this.total_hands = player_JSON.total_hands;
            this.walks = player_JSON.walks;
            this.vpip_hands = player_JSON.vpip_hands;
            this.pfr_hands = player_JSON.pfr_hands;
        } else {
            this.total_hands = 0;
            this.walks = 0;
            this.vpip_hands = 0;
            this.pfr_hands = 0;
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

    public toJSON(): any {
        return {
            "id": this.id,
            "total_hands": this.total_hands,
            "walks": this.walks,
            "vpip_hands": this.vpip_hands,
            "pfr_hands": this.pfr_hands,
        }
    }
}