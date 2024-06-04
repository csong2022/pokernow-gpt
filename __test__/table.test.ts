import { Table } from "../app/models/table"
import { Player } from "../app/models/player"
import { PlayerData } from "../app/models/player-data"
//const table = require('./table')

test('properly set variables', () => {
    let test1 = new Table(3, "NLH", 1)
    expect(test1.getStakes()).toBe(1)
    expect(test1.getGameType()).toBe("NLH")
    expect(test1.getButton()).toBe(3)
})

test('update button tests', () => {
    let test1 = new Table(3, "NLH", 1)
    expect(test1.getNextButton(3)).toBe(4)
    expect(test1.getNextButton(10)).toBe(0)
    test1.updateButton(6)
    expect(test1.getButton()).toBe(6)
})

test('update player tests', () => {
    let test1 = new Table(3, "NLH", 1)
    let player1data = new PlayerData('alwayswins', 1)
    let player1 = new Player("voldlord", 100, 1, player1data)
    test1.addPlayer(1, player1)
    expect(test1.getNumPlayers()).toBe(1)
    test1.removePlayer(1)
    expect(test1.getNumPlayers()).toBe(0)
})

test('betting tests', () => {
    let test1 = new Table(3, "NLH", 1)
    let player1data = new PlayerData('alwayswins', 1)
    let player1 = new Player("voldlord", 100, 1, player1data)
    test1.addPlayer(1, player1)
    expect(test1.getNumPlayers()).toBe(1)
    test1.updatePot(100)
    expect(test1.getPot()).toBe(100)
    //expect(test1.getNumPotPlayers()).toBe(1)
    //test1.foldPlayer(1)
    //expect(test1.getNumPotPlayers()).toBe(0)
})