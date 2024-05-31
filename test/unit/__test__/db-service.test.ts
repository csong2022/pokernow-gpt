import * as db from '../../../app/database/db-service';
import * as player_service from '../../../app/services/player-service'

describe('database service', () => {
    test('testing creating database tables', async () => {
        db.query('INSERT INTO Player (playerid, total_hands) VALUES (?, ?)', ['player1', '123'])
        const player = await player_service.get('player1');
        const player_id = player[0];
        const total_hands = player[1];
        expect(player_id).toEqual('player1')
        expect(total_hands).toEqual('123')
    }
    )
})

