import { fetchData, getCreatedAt } from "../../app/services/log-service.ts"
import { SUCCESS_RESPONSE, ERROR_RESPONSE} from '../../app/utils/error-handling-utils.ts';
import { getData, getMsg, getLast, getFirst } from '../../app/services/log-service.ts';
import { validateAllMsg, validateMsg, pruneFlop, getPlayerStacksFromMsg, pruneLogsBeforeCurrentHand, getPlayerStacksMsg, getTableSeatToIdFromMsg, getNameToIdFromMsg, getIdToTableSeatFromMsg } from "../../app/services/message-service.ts";
import { Table } from "../../app/models/table.ts";
import { table } from "console";

describe('log service test', async () => {
    it.only("should properly get logs and filter through them", async() => {
        const log = await fetchData("pglrRhwA65bP08G-KFoygFwoC", "", "")
        if (log.code === SUCCESS_RESPONSE) {
            //console.log('success', log.data)
            const res1 = getMsg(getData(log));
            console.log("all messages", res1);

            const prune = getMsg(pruneLogsBeforeCurrentHand(getData(log)));
            console.log("pruned until starting", prune);

            const prune_flop = pruneFlop(prune);
            console.log("prune_flop", prune_flop);

            const prune_flop_verify = validateAllMsg(prune_flop);
            console.log("prune_flop verified", prune_flop_verify);

            const pruneres = validateAllMsg(prune);
            console.log("valid actions until starting", pruneres);

            const player_stack_msg = getPlayerStacksMsg(prune_flop)
            console.log("player_stack_msg", player_stack_msg)
            const player_stacks_from_msg = getPlayerStacksFromMsg(player_stack_msg, 20)
            console.log("player_stacks_from_msg", player_stacks_from_msg)
            const table_seats = getTableSeatToIdFromMsg(player_stack_msg)
            console.log("table_seats", table_seats)
            const id_to_table_seat = getIdToTableSeatFromMsg(player_stack_msg);
            console.log("id_to_table_seat", id_to_table_seat)

            const t = new Table();
            t.nextHand();
            t.setTableSeatToId(table_seats);
            t.preProcessLogs(pruneres, 20);
            const get_first = t.getFirstSeatOrderId();
            console.log("get_first", get_first)
            const first_pos = id_to_table_seat.get(get_first)!;
            console.log("first_pos", first_pos)

            t.setIdToPosition(first_pos);

            t.postProcessLogsAfterHand(prune_flop_verify);
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

            const name_to_id = getNameToIdFromMsg(player_stack_msg)
            console.log("name_to_id", name_to_id)

            //console.log(t.getPlayerPositions.)
        }
        if (log.code === ERROR_RESPONSE) {
            console.log('error', log.error);
        }
    })
})