import { Card } from "./card"
import { Player } from "./player"

export class Table {
    private button: number; //position of button as an int
    private seats: Array<boolean>; //index 0-9 for which positions are seated
    private inPot: Array<boolean>; //index 0-9 for whuch positions are in the current pot
    private playerBets: Array<number>; //array for players bet in current street
    private players: Array<Player>; //array of players
    private runout: Array<Card>; //array of Cards for the community cards
    private pot: number //current pot
    private gameType: string; //string for no limit holdem or pot limit omaha
    private stakes: number; //stake in big blinds

    constructor(button: number, gameType: string, stakes: number) {
        this.button = button;
        this.seats = new Array<boolean>(10);
        this.inPot = new Array<boolean>(10);
        this.playerBets = new Array<number>(10);
        this.players = new Array<Player>(10);
        this.runout = new Array<Card>(5);
        this.pot = 0
        this.gameType = gameType;
        this.stakes = stakes;
    }

    public nextRound(): void {
        this.runout = <Card[]>[];
        this.updateButton(this.getNextButton(this.button));
        this.pot = 0;
        this.inPot = Object.assign([], this.seats)
    }

    public nextStreet(nextCard: Card): void {
        this.runout.push(nextCard);
        this.playerBets = new Array<number>(10);
    }

    public addCard(card: Card): void {
        this.runout.push(card);
    }

    public getStreet(): string {
        if (this.runout.length == 0) {
            return "Preflop"
        } else if (this.runout.length == 3) {
            return "Flop"
        } else if (this.runout.length == 4) {
            return "Turn"
        } else if (this.runout.length == 5) {
            return "River"
        } else {
            console.error("Could not get runout street");
            return "Error"
        }
    }

    public getPosition(position: number) {
        let distance = 0;
        
        this.button
    }

    public addPlayer(position: number, player: Player): void {
        this.seats[position] = true;
        this.players[position] = player;
    }

    public removePlayer(position: number): void {
        this.seats[position] = false;
        delete this.players[position];
    }

    public foldPlayer(position: number): void {
        this.inPot[position] = false;
    }

    public getNumPlayers(): number { //players sitting at table
        return this.seats.filter(Boolean).length;
    }

    public getNumPotPlayers(): number { //players currently in the pot
        return this.inPot.filter(Boolean).length;
    }

    public getRunout(): Array<Card> {
        return this.runout;
    }

    public updatePot(pot: number): void {
        this.pot = pot;
    }

    public getPot(): number {
        let bets = 0
        for (const b of this.playerBets) {
            if (typeof b == "number") {
                bets += b; 
            }
        }
        return this.pot + bets
    }

    public updateButton(position: number): void {
        this.button = position;
    }

    public getNextButton(position: number): number {
        if (position < 10) {
            return position + 1
        } else {
            return 0
        }
    }

    public getStakes(): number {
        return this.stakes;
    }

    public getGameType(): string {
        return this.gameType;
    }

    public getButton(): number {
        return this.button;
    }
}