import { assert } from "chai";

import { Table } from "../../app/models/table.ts";

import { DBService } from "../../app/services/db-service.ts";
import { PlayerService } from "../../app/services/player-service.ts";

const player_id = "chan-abcd";
const player_JSON = {
    "id": player_id,
    "total_hands": 10,
    "walks": 2,
    "vpip_hands": 5,
    "pfr_hands": 3
}

describe('cachePlayer tests', async() => {
    it("should properly cache player when player does not exist in db", async() => {
        const db_service = new DBService("./test/unit/pokernow-gpt-test.db");
        await db_service.init();
        const player_service = new PlayerService(db_service);

        const table = new Table(player_service);
        const msg = [player_id, "chan"]
        await table.cachePlayer(msg[0], msg[1]);
        
        assert.equal(table.getPlayerCache().size, 1);
        assert.isNotNull(table.getPlayerCache().get(player_id));
        const player_stats_str = await player_service.get(player_id);
        assert.isNotEmpty(player_stats_str);
        const player_stats = JSON.parse(JSON.stringify(player_stats_str));
        assert.equal(player_stats.id, player_id);
        
        //cleanup
        player_service.remove(player_id);
        await db_service.close();
    })

    it("should properly cache player when player already exists in db", async() => {
        const db_service = new DBService("./test/unit/pokernow-gpt-test.db");
        await db_service.init();
        const player_service = new PlayerService(db_service);

        const table = new Table(player_service);
        const msg = [player_id, "chan"]
        await player_service.create(player_JSON);
        await table.cachePlayer(msg[0], msg[1]);
    
        //assert
        assert.equal(table.getPlayerCache().size, 1);
        assert.isNotNull(table.getPlayerCache().get(player_id));
        const player = table.getPlayerCache().get(player_id)!;
        assert.equal(player.getPlayerStats().getTotalHands(), 10);
    
        //cleanup
        player_service.remove(player_id);
        await db_service.close();
    })
});