const fetch = require('node-fetch')

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

export type BaseFetchResponse<D, E> = Promise<SuccessResponse<D> | ErrorResponse<E>>;

const endpoint = "https://www.pokernow.club/games/pgltNd4w17e6J4JXouHm6dw5l/log?before_at=&after_at=&mm=false&v=2"

export const fetchData = async <D, E=Error>(
    method: "GET",
    bodyData?: Record<string, unknown>
): BaseFetchResponse<D, E> => {
    let fetchOptions: RequestInit = {
        headers: {
            'Content=type': 'applications/json'
        },
        method,
    };
    let apiUrl = endpoint

    const urlSearchParams = new URLSearchParams();
    
    try {
        const response = await fetch(apiUrl);
        if (response.ok) {
            try {
                const data = (await response.json()) as D;
                //console.log(data)
                return {
                    code: "success",
                    data,
                };

            } catch (error) {
                throw error;
            }
        }
    } catch (error) {
        return {
            code: "error",
            error: error as E,
        };
    }

    return {
        code: "error",
        error: new Error("Cannot make the service request") as E,
    };
};