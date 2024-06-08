const fetch = require('node-fetch')

import type { Response } from '../utils/error-handling-utils.ts';
//import { SUCCESS_RESPONSE } from '../utils/error-handling-utils.ts';

export const fetchData = async <D, E=Error>(
    method: string = "GET",
    url: string,
    before: string = "",
    after: string = "",
    bodyData?: Record<string, unknown>
): Response<D, E> => {
    let fetchOptions: RequestInit = {
        headers: {
            'Content=type': 'applications/json'
        },
        method,
    };
    let beforeStr = "/log?before_at=".concat(before)
    let afterStr = "&after_at=".concat(after)
    let fullargs = beforeStr.concat(afterStr).concat("&mm=false&v=2")
    let apiUrl = url.concat(fullargs)
    console.log(apiUrl)

    const urlSearchParams = new URLSearchParams();
    
    try {
        const response = await fetch(apiUrl);
        if (response.ok) {
            try {
                const data = (await response.json()) as D;
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

interface Data {
    logs: Array<Log>
}
interface Log {
    at: string,
    created_at: string,
    msg: string
}

export function getData(log: any): Data {
    let data = log.data as JSON
    let str = JSON.stringify(data)
    const res = JSON.parse(str) as Data
    return res
}

export function getMsg(data: Data): Array<string> {
    let res = new Array<string>
    data.logs.forEach((element) => {
        res.push(element.msg)
    })
    return res
}

export function getCreatedAt(data: Data): Array<string> {
    let res = new Array<string>
    data.logs.forEach((element) => {
        res.push(element.created_at)
    })
    return res
}

export function getLast(arr: Array<string>): string {
    return arr[arr.length - 1]
}

export function getFirst(arr: Array<string>): string {
    return arr[0]
}