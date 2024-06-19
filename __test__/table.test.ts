import { Table } from "../app/models/table.ts"
import { Player } from "../app/models/player.ts"
//import { PlayerData } from "../app/models/player-stats.ts"
//const table = require('./table')

test('properly set variables', () => {
    const table1 = new Table();
    expect(table1.getPot()).toBe(0);
    table1.updatePot(1);
    expect(table1.getPot()).toBe(1);
})