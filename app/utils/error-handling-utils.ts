export const SUCCESS_RESPONSE = "success";
export const ERROR_RESPONSE = "error";

export type SuccessResponse<D> = {
    code: typeof SUCCESS_RESPONSE;
    data: D;
}

export type ErrorResponse<E = Error> = {
    code: typeof ERROR_RESPONSE;
    error: E;
}

export type Response<D, E> = Promise<SuccessResponse<D> | ErrorResponse<E>>;

export function log_response<D, E=Error>(res: SuccessResponse<D> | ErrorResponse<E>) : string {
    if (res.code == SUCCESS_RESPONSE) {
        console.log(res.data);
    } else {
        console.log(res.error);
    }
    return res.code;
}