import { assert } from "chai";

import { Table } from "../../app/models/table.ts";

import { DBService } from "../../app/services/db-service.ts";
import { PlayerService } from "../../app/services/player-service.ts";

const player_name = "chan-abcd";
const player_JSON = {
    "name": "player_name",
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
        const msg = [player_name, "chan"]
        await table.cachePlayer(msg[0], msg[1]);
        
        assert.equal(table.getPlayerCache().size, 1);
        assert.isNotNull(table.getPlayerCache().get(player_name));
        const player_stats_str = await player_service.get(player_name);
        assert.isNotEmpty(player_stats_str);
        const player_stats = JSON.parse(JSON.stringify(player_stats_str));
        assert.equal(player_stats.name, player_name);
        
        //cleanup
        player_service.remove(player_name);
        await db_service.close();
    })

    it("should properly cache player when player already exists in db", async() => {
        const db_service = new DBService("./test/unit/pokernow-gpt-test.db");
        await db_service.init();
        const player_service = new PlayerService(db_service);

        const table = new Table(player_service);
        const msg = [player_name, "chan"]
        await player_service.create(player_JSON);
        await table.cachePlayer(msg[0], msg[1]);
    
        //assert
        assert.equal(table.getPlayerCache().size, 1);
        assert.isNotNull(table.getPlayerCache().get(player_name));
        const player = table.getPlayerCache().get(player_name)!;
        assert.equal(player.getPlayerStats().getTotalHands(), 10);
    
        //cleanup
        player_service.remove(player_name);
        await db_service.close();
    })
});