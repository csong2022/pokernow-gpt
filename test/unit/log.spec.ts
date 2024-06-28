import { fetchData, getCreatedAt } from "../../app/services/log-service.ts"
import { SUCCESS_RESPONSE, ERROR_RESPONSE} from '../../app/utils/error-handling-utils.ts';
import { getData, getMsg, getLast, getFirst } from '../../app/services/log-service.ts';
import { getPlayer, getPlayerAction, getFirstWord, validateAllMsg, validateMsg, pruneStarting, pruneFlop, getPlayerStacksFromMsg } from "../../app/services/message-service.ts";
import { Table } from "../../app/models/table.ts";

describe('log service test', async () => {
    it("should properly get logs and filter through them", async() => {
        const log = await fetchData("pglrRhwA65bP08G-KFoygFwoC", "", "")
        if (log.code === SUCCESS_RESPONSE) {
            //console.log('success', log.data)
            const res1 = getMsg(getData(log));
            console.log("all messages", res1);

            const prune = pruneStarting(res1);
            console.log("pruned until starting", prune);

            const prune_flop = pruneFlop(prune);
            console.log("prune_flop", prune_flop);

            const prune_flop_verify = validateAllMsg(prune_flop);
            console.log("prune_flop verified", prune_flop_verify);

            const pruneres = validateAllMsg(prune);
            console.log("valid actions until starting", pruneres);

            const t = new Table();
            t.nextHand();
            t.preProcessLogs(pruneres);
            t.classifyAction(prune_flop_verify);
            t.setPlayerInitialStacksFromMsg(res1, 20);
            console.log("stacks", t.getPlayerInitialStacks());
            console.log("player_actions", t.getActionNumFromId());
            await t.cacheFromLogs(prune_flop_verify)
            console.log("player cache", t.getPlayerCache());
            t.processPlayers();
            console.log("player cache after processing", t.getPlayerCache());
            t.convertAllOrdersToPosition();
            console.log(t.getLogsQueue());
            console.log("player positions", t.getPlayerPositions());


            //console.log(t.getPlayerPositions.)
        }
        if (log.code === ERROR_RESPONSE) {
            console.log('error', log.error);
        }
    })
})