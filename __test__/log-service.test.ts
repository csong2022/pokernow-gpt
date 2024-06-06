import { ERROR_RESPONSE, SUCCESS_RESPONSE, fetchData } from "../app/services/log-service.ts"
import type { SuccessResponse, ErrorResponse, BaseFetchResponse} from "../app/services/log-service.ts"

test('test chens table', async () => {
    const log = await fetchData("GET", "https://www.pokernow.club/games/pgltNd4w17e6J4JXouHm6dw5l")
    if (log.code === SUCCESS_RESPONSE) {
        console.log('success', log.data)
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