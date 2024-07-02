import { Table } from "../../app/models/table.ts";

import { DBService } from '../../app/services/db-service.ts';
import { PlayerService } from '../../app/services/player-service.ts';

import { SUCCESS_RESPONSE, ERROR_RESPONSE} from '../../app/utils/error-handling-utils.ts';
import { LogService } from '../../app/services/log-service.ts';

import { postProcessLogsAfterHand, preProcessLogs } from "../../app/utils/log-processing-utils.ts";
import { validateAllMsg, getIdToInitialStackFromMsg, getPlayerStacksMsg, getTableSeatToIdFromMsg, getNameToIdFromMsg, getIdToTableSeatFromMsg } from "../../app/utils/message-processing-utils.ts";
import { Game } from "../../app/models/game.ts";

describe('log service test', async () => {
    it("should properly get logs and filter through them", async() => {
        const log_service = new LogService("pglwmlKkOFo27_NuNANl_6Du2");
        await log_service.init();

        const db_service = new DBService("./pokernow-gpt-test.db");
        await db_service.init();
        const player_service = new PlayerService(db_service);

        const log = await log_service.fetchData("", "")
        if (log.code === SUCCESS_RESPONSE) {
            const res1 = log_service.getMsg(log_service.getData(log));
            console.log("all messages", res1);

            const prune = log_service.getMsg(log_service.pruneLogsBeforeCurrentHand(log_service.getData(log)));
            console.log("pruned until starting", prune);

            const prune_verify = validateAllMsg(prune);
            console.log("prune_flop verified", prune_verify);

            const pruneres = validateAllMsg(prune);
            console.log("valid actions until starting", pruneres);

            const player_stack_msg = getPlayerStacksMsg(prune);
            console.log("player_stack_msg", player_stack_msg);
            const player_stacks_from_msg = getIdToInitialStackFromMsg(player_stack_msg, 20);
            console.log("player_stacks_from_msg", player_stacks_from_msg);
            const table_seats = getTableSeatToIdFromMsg(player_stack_msg);
            console.log("table_seats", table_seats);
            const id_to_table_seat = getIdToTableSeatFromMsg(player_stack_msg);
            console.log("id_to_table_seat", id_to_table_seat);

            const t = new Table(player_service);
            const g = new Game("11", t, 20, 10, "NLH", 30);
            t.nextHand();
            t.setTableSeatToId(table_seats);
            console.log("preprocessing logs");
            preProcessLogs(pruneres, g);
            const get_first = t.getFirstSeatOrderId();
            console.log("get_first", get_first);
            const first_pos = id_to_table_seat.get(get_first)!;
            console.log("first_pos", first_pos);

            t.setIdToPosition(first_pos);

            postProcessLogsAfterHand(prune_verify, g);
            t.setPlayerInitialStacksFromMsg(res1, g.getBigBlind());
            console.log("stacks", t.getPlayerInitialStacks());
            console.log("player_actions", t.getIdToActionNum());
            console.log("player cache", t.getPlayerCache());
            t.processPlayers();
            console.log("player cache after processing", t.getPlayerCache());
            t.convertAllOrdersToPosition();
            console.log(t.getLogsQueue());
            console.log("player positions", t.getPlayerPositions());

            const name_to_id = getNameToIdFromMsg(player_stack_msg);
            console.log("name_to_id", name_to_id);
        }
        if (log.code === ERROR_RESPONSE) {
            console.log('error', log.error);
        }
        db_service.close();
    })
})