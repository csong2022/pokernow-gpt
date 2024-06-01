import { Card } from "./card"

export class Table {
    private button: number;
    private seats: Array<boolean>;
    private runout: Array<Card>

    constructor(button: number, seats: Array<boolean>) {
        this.button = button;
        this.seats = new Array<boolean>(10);
    }
}