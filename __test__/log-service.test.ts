import { fetchData, getCreatedAt } from "../app/services/log-service.ts"
import { SUCCESS_RESPONSE, ERROR_RESPONSE} from '../app/utils/error-handling-utils.ts';
import { getData, getMsg, getLast, getFirst } from '../app/services/log-service.ts';
import { getPlayer, getPlayerAction, getFirstWord, validateAllMsg, validateMsg, pruneStarting } from "../app/services/message-service.ts";
import { Table } from "../app/models/table.ts";

test('test chens table', async () => {
    const log = await fetchData("GET", "pgltNd4w17e6J4JXouHm6dw5l")
    if (log.code === SUCCESS_RESPONSE) {
        console.log('success', log.data)
    }
    if (log.code === ERROR_RESPONSE) {
        console.log('error', log.error)
    }
})

test('test chens table 123', async () => {
    const log = await fetchData("GET", "pglASZj2h6E1zduo4KGuhggyg", "", "")
    if (log.code === SUCCESS_RESPONSE) {
        //console.log('success', log.data)
        const res = getData(log);
        const res1 = getMsg(res);
        console.log("messages", res1);
        const prune = pruneStarting(res1);
        console.log("pruned until starting", prune);
        const res5 = validateAllMsg(res1);
        console.log("all msgs", res5);
        const pruneres = validateAllMsg(prune);
        console.log("valid actions until starting", pruneres);
        const t = new Table();
        t.nextHand();
        t.processLogs(pruneres);
        t.convertDict();
        console.log(t.getLogsQueue());
        console.log(t.getLogsQueue().size());
        console.log(t.popLogsQueue());
        console.log(t.getLogsQueue());
        console.log(t.getLogsQueue().size());
        //console.log(t.getPlayerPositions.)
    }
    if (log.code === ERROR_RESPONSE) {
        console.log('error', log.error);
    }
})