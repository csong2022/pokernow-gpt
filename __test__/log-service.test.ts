import { ERROR_RESPONSE, SUCCESS_RESPONSE, fetchData } from "../app/services/log-service.ts"
import type { SuccessResponse, ErrorResponse, BaseFetchResponse} from "../app/services/log-service.ts"

test('properly set variables', async () => {
    const log = await fetchData("GET")
    if (log.code === SUCCESS_RESPONSE) {
        console.log('success', log.data)
    }
    if (log.code === ERROR_RESPONSE) {
        console.log('eror', log.error)
    }
})