export class PlayerData {
    private id: string;
    private total_hands: number;
    //private vpip_hands: number;
    //private vpip_stat: number;
    //private pfr_hands: number;
    //private pfr_stat: number;

    constructor(id: string, total_hands: number) {
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
}
