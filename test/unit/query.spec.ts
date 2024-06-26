import { fetchData, getCreatedAt } from "../../app/services/log-service.ts"
import { SUCCESS_RESPONSE, ERROR_RESPONSE} from '../../app/utils/error-handling-utils.ts';
import { closeBrowser, getData, getMsg, getLast, getFirst } from '../../app/services/log-service.ts';
import { getPlayer, getPlayerAction, getFirstWord, validateAllMsg, validateMsg, pruneStarting, pruneFlop, getPlayerStacksMsg } from "../../app/services/message-service.ts";
import { Table } from "../../app/models/table.ts";
import { defineActions, defineStats, defineStacks, postProcessLogs, constructQuery } from "../../app/services/query-service.ts";
import { Game } from "../../app/models/game.ts";
import { Hero, Player } from "../../app/models/player.ts";
import { PlayerStats } from "../../app/models/player-stats.ts";
import { queryGPT } from "../../app/services/openai-service.js";
import { queryObjects } from "v8";

describe('log service test', async () => {
    it("should properly get logs and filter through them", async() => {
        const log = await fetchData("pglrRhwA65bP08G-KFoygFwoC", "", "");
        if (log.code === SUCCESS_RESPONSE) {
            //console.log('success', log.data)
            const res1 = getMsg(getData(log));
            const prune = pruneStarting(res1);
            const prune_flop = pruneFlop(prune);
            const prune_flop_verify = validateAllMsg(prune_flop);
            const pruneres = validateAllMsg(prune);
            const g = new Game("11", 10, "NLH");
            const t = g.getTable()
            let hero_stats = new PlayerStats('aa')
            let hero = new Hero('xdd', hero_stats, ['4♣','4♥'])
            g.setHero(hero)
            t.nextHand();
            t.preProcessLogs(pruneres);
            t.classifyAction(prune_flop_verify);
            t.setPlayerStacks(res1);
            await t.cacheFromLogs(prune_flop_verify);
            t.processPlayers();
            t.convertAllOrdersToPosition();

            postProcessLogs(t.getLogsQueue(), g);
            //console.log("player_actions", t.getPlayerActions());
            
            /* const stacks_msg = defineStacks(t);
            console.log("stacks query", stacks_msg);

            const action_msg = defineActions(t);
            console.log("action query", action_msg);

            const stats_msg = defineStats(t);
            console.log("stats query", stats_msg);

            const name_to_id = t.getNameToID();
            console.log(name_to_id); */

            //let query = constructQuery(g)

            let query = `Help me decide my action in No Limit Hold'em poker. I'm in the SB with a stack size of 100 BBs. 
                My hole cards are: 4♣, 4♥
                The current street is the preflop.
                Here are the initial stack sizes of all players involved:
                SB: 100 BBs, BB: 100 BBs
                Here are the current actions that are relevant:
                SB posts 1 BB, BB posts 2 BB
                Stats of players in the pot:
                SB: VPIP: 0, PFR: 0
                BB: VPIP: 100, PFR: 0
                Please limit response to only the action word and bet size (if betting)`;
            
            //let query = "hi my name is bob"

            console.log("query", query)
            let [resp, messages] = await queryGPT(query, null)
            console.log("response", resp)
            console.log("content", resp!.message.content)
            console.log("messages", messages)
            /* messages.push(resp!.message)
            console.log("messages after push", messages)
            let query1 = "do you remember my name?"

            console.log("query1", query1)
            let [resp1, messages1] = await queryGPT(query1, messages)
            console.log("resp1", resp1)
            console.log("messages1", messages1) */

        }
        if (log.code === ERROR_RESPONSE) {
            console.log('error', log.error);
        }
        closeBrowser();
    })
})