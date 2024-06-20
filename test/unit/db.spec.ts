import * as player_service from "../../app/services/player-service.ts"
import { assert } from "chai";
import { PlayerStats } from "../../app/models/player-stats.ts"
import { Table } from "../../app/models/table.ts";

const player_id = "chan-abcd";
const player_JSON = {
    "id": player_id,
    "total_hands": 10,
    "walks": 2,
    "vpip_hands": 5,
    "vpip_stat": 0.625,
    "pfr_hands": 3,
    "pfr_stat": 0.375
}

describe('cachePlayer tests', async() => {
    it("should properly cache player when player does not exist in db", async() => {
        debugger;
        const table = new Table();
        const msg = [player_id, "chan"]
        await table.cachePlayer(msg);
        
        assert.equal(table.getPlayerCache().size, 1);
        assert.isNotNull(table.getPlayerCache().get(player_id));
        const player_stats_str = await player_service.get(player_id);
        assert.isNotEmpty(player_stats_str);
        const player_stats = JSON.parse(JSON.stringify(player_stats_str));
        assert.equal(player_stats.id, player_id);
        
        //cleanup
        player_service.remove(player_id);
    })

    it("should properly cache player when player already exists in db", async() => {
        const table = new Table();
        const msg = [player_id, "chan"]
        await player_service.create(player_JSON);
        await table.cachePlayer(msg);
    
        //assert
        assert.equal(table.getPlayerCache().size, 1);
        assert.isNotNull(table.getPlayerCache().get(player_id));
        const player = table.getPlayerCache().get(player_id)!;
        assert.equal(player.getPlayerStats().getTotalHands(), 10);
    
        //cleanup
        player_service.remove(player_id);
    })
});