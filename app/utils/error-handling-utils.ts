import { ERROR } from "sqlite3";

export const SUCCESS_RESPONSE = "success";
export const ERROR_RESPONSE = "error";

export enum DebugMode {
    NOLOG,
    CONSOLE,
    LOGTOFILE
}

export type SuccessResponse<D> = {
    code: typeof SUCCESS_RESPONSE;
    data: D;
    msg: string;
}

export type ErrorResponse<E = Error> = {
    code: typeof ERROR_RESPONSE;
    error: E;
}

export type Response<D, E> = Promise<SuccessResponse<D> | ErrorResponse<E>>;

export function logResponse<D, E=Error>(res: SuccessResponse<D> | ErrorResponse<E>, debug_mode: DebugMode): string {
    switch (debug_mode) {
        case DebugMode.NOLOG:
            break;
        case DebugMode.CONSOLE:
            if (res.code == SUCCESS_RESPONSE) {
                console.log(res.msg);
            } else if (res.code == ERROR_RESPONSE) {
                console.log(res.error);
            }
        case DebugMode.LOGTOFILE:
            //TODO: implement logging to file
    }
    return res.code;
}