import { fetchData, getCreatedAt } from "../app/services/log-service.ts"
import { SUCCESS_RESPONSE, ERROR_RESPONSE} from '../app/utils/error-handling-utils.ts';
import { getData, getMsg } from '../app/services/log-service.ts';
import { getPlayer, getPlayerAction, getFirstWord, validateAllMsg, validateMsg } from "../app/services/message-service.ts";

test('test chens table', async () => {
    const log = await fetchData("GET", "https://www.pokernow.club/games/pgltNd4w17e6J4JXouHm6dw5l")
    if (log.code === SUCCESS_RESPONSE) {
        //console.log('success', log.data)
        let res = getData(log)
        let res1 = getMsg(res)
        console.log(res1)
        let p1 = getPlayer(res1[0])
        console.log(p1)
        let p2 = getPlayerAction(res1[0], "EpfAPvbm1K")
        console.log(p2)
        let p3 = getFirstWord(p2)
        console.log(p3)
        let res2 = getCreatedAt(res)
        console.log(res2)
        //console.log(res.logs[0].msg)
    }
    if (log.code === ERROR_RESPONSE) {
        console.log('error', log.error)
    }
})

test('test chens table 123', async () => {
    const log = await fetchData("GET", "https://www.pokernow.club/games/pgl2i8eXxJBQDBvxTNN1a9urf", "", "171763427711700")
    if (log.code === SUCCESS_RESPONSE) {
        //console.log('success', log.data)
        let res = getData(log)
        let res1 = getMsg(res)
        console.log(res1)
        let p1 = getPlayer(res1[10])
        console.log(p1)
        let p2 = getPlayerAction(res1[10], "hjf1Arb46X")
        console.log(p2)
        let p3 = getFirstWord(p2)
        console.log(p3)
        let p4 = validateMsg(p2)
        console.log(p4)
        let res2 = getCreatedAt(res)
        console.log(res2)
    }
    if (log.code === ERROR_RESPONSE) {
        console.log('error', log.error)
    }
})