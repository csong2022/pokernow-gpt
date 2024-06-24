import { fetchData, getCreatedAt } from "../../app/services/log-service.ts"
import { SUCCESS_RESPONSE, ERROR_RESPONSE} from '../../app/utils/error-handling-utils.ts';
import { getData, getMsg, getLast, getFirst } from '../../app/services/log-service.ts';
import { getPlayer, getPlayerAction, getFirstWord, validateAllMsg, validateMsg, pruneStarting, pruneFlop, getPlayerStacksMsg } from "../../app/services/message-service.ts";
import { Table } from "../../app/models/table.ts";

describe('log service test', async () => {
    it("should properly get logs and filter through them", async() => {
        const log = await fetchData("GET", "pglASZj2h6E1zduo4KGuhggyg", "", "")
        if (log.code === SUCCESS_RESPONSE) {
            //console.log('success', log.data)
            const res1 = getMsg(getData(log));
        

            const prune = pruneStarting(res1);
            

            const prune_flop = pruneFlop(prune);
            

            const prune_flop_verify = validateAllMsg(prune_flop);
            

            const pruneres = validateAllMsg(prune);
            

            const t = new Table();
            t.nextHand();
            t.preProcessLogs(pruneres);
            t.processStats(prune_flop_verify);
            t.setPlayerStacks(res1);
            
            await t.cacheFromLogs(prune_flop_verify)
            
            t.processPlayers();
            
            t.convertDict();
            

        }
        if (log.code === ERROR_RESPONSE) {
            console.log('error', log.error);
        }
    })
})