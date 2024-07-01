export interface Data {
    logs: Array<Log>
}

export interface Log {
    at: string,
    created_at: string,
    msg: string
}

export interface ProcessedLogs {
    valid_msgs: Array<Array<string>>,
    last_created: string,
    first_fetch: boolean
}