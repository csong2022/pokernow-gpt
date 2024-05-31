const dbService = require('../db-service');

describe('database service', () => {
    test('testing creating database tables', () => {
        dbService.createDatabase()
        dbService.query('INSERT INTO Player (playerid, total_hands) VALUES (player1, 123)')
        const { player_id, total_hands } = dbService.query('SELECT * FROM Player')

        expect(player_id).toEqual('player1')
        expect(total_hands).toEqual('123')
    }
    )
})

