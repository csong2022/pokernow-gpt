import { queryObjects } from "v8";

import { parseResponse } from "../../app/helpers/ai-query-helper.ts";

import { Game } from "../../app/models/game.ts";
import { Hero, Player } from "../../app/models/player.ts";
import { PlayerStats } from "../../app/models/player-stats.ts";
import { Table } from "../../app/models/table.ts";

import { DBService } from "../../app/services/db-service.ts";
import { LogService } from "../../app/services/log-service.ts"
import { OpenAIService } from '../../app/services/openai-service.ts';
import { PlayerService } from "../../app/services/player-service.ts";

import { Queue } from "../../app/utils/data-structures.ts";
import { SUCCESS_RESPONSE, ERROR_RESPONSE} from '../../app/utils/error-handling-utils.ts';
import { validateAllMsg } from "../../app/utils/message-processing-utils.ts";
import { convertToValue } from "../../app/utils/value-conversion-utils.ts";

describe('query service test', async () => {
    it("should properly get logs and filter through them", async() => {
        const log_service = new LogService("pglrRhwA65bP08G-KFoygFwoC");
        await log_service.init();

        const db_service = new DBService("./pokernow-gpt-test.db");
        await db_service.init();
        const player_service = new PlayerService(db_service);

        const openai_service = new OpenAIService();
        await openai_service.init();

        const log = await log_service.fetchData("", "");
        if (log.code === SUCCESS_RESPONSE) {
            //console.log('success', log.data)
            const res1 = log_service.getMsg(log_service.getData(log));
            const prune = log_service.getMsg(log_service.pruneLogsBeforeCurrentHand(log_service.getData(log)));
            const prune_verify = validateAllMsg(prune);
            const pruneres = validateAllMsg(prune);
            const g = new Game("11", new Table(player_service), 10, 5, "NLH", 30);
            const t = g.getTable()
            let hero_stats = new PlayerStats('aa')
            let hero = new Hero('xdd', hero_stats, ['4♣','4♥'], 10)
            g.setHero(hero)
            t.nextHand();
            t.preProcessLogs(pruneres, g.getBigBlind());
            t.postProcessLogsAfterHand(prune_verify);
            t.setPlayerInitialStacksFromMsg(res1, 10);
            t.processPlayers();
            t.convertAllOrdersToPosition();

            t.postProcessLogs(t.getLogsQueue(), g);
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

            let query =  "Help me decide my action in No Limit Hold'em poker. I'm in the BB with a stack size of 49.5 BBs. \n" +
      'My hole cards are: A♠, 3♣\n' +
      'The current street is: flop and it is 2-handed.\n' +
      'The current community cards are:  [7♦, A♦, 3♥]\n' +
      'Here are the initial stack sizes of all players involved: \n' +
      'SB: 76.7 BBs, BB: 49.5 BBs\n' +
      'Here are the current actions that are relevant:\n' +
      'SB posts 0.5 BB, BB posts 1 BB, SB calls 1 BB, BB checks\n' +
      'Stats of players in the pot:\n' +
      'SB: VPIP: 85.71428571428571, PFR: 0\n' +
      'BB: VPIP: 0, PFR: 0\n' +
      'Please respond in this format: {action,bet_size_in_BBs}';
            
            //let query = "hi my name is bob"

            console.log(process.env["OPENAI_API_KEY"]);
            console.log("query", query)
            let GPTResponse = await openai_service.queryGPT(query, []);
            const resp = GPTResponse.choices;
            const messages = GPTResponse.prevMessages;
            console.log("response", resp)
            const message_content = resp!.message.content;
            console.log("content", message_content)
            console.log("messages", messages)
            const bot_action = parseResponse(message_content!);
            console.log("action str:", bot_action.action_str);
            console.log("bet size:", bot_action.bet_size_in_BBs);
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
        db_service.close();
    })
})