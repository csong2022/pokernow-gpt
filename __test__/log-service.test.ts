import { fetchData } from "../app/services/log-service.ts"
import { SUCCESS_RESPONSE, ERROR_RESPONSE } from '../app/utils/error-handling-utils.ts';

test('test chens table', async () => {
    const log = await fetchData("GET", "https://www.pokernow.club/games/pgltNd4w17e6J4JXouHm6dw5l")
    if (log.code === SUCCESS_RESPONSE) {
        //console.log('success', log.data)
        let d = log.data as JSON
        let p = JSON.stringify(d)
        interface Data {
            logs: Array<Log>
        }
        interface Log {
            at: string,
            created_at: string,
            msg: string
        }
        const q = JSON.parse(p) as Data
        //console.log(typeof p)
        console.log(q)
        console.log(q.logs[0].created_at)
        //console.log(typeof q)
        //console.log(q.logs)
    }
    if (log.code === ERROR_RESPONSE) {
        console.log('error', log.error)
    }
})

test('test chens table', async () => {
    const log = await fetchData("GET", "https://www.pokernow.club/games/pgl2i8eXxJBQDBvxTNN1a9urf", "", "171763427711700")
    if (log.code === SUCCESS_RESPONSE) {
        console.log('success', log.data)
    }
    if (log.code === ERROR_RESPONSE) {
        console.log('error', log.error)
    }
})