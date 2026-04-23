export interface EntryParams {
    name: string,
    stack_size: number
}

export interface StopSignal {
    event_name: 'stop'
}