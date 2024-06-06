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