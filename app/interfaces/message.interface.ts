export interface EntryParams {
    name: string,
    stack_size: number
}

export interface StopSignal {
    event_name: 'stop'
}

export interface RequestProcessPlayers {
    event_name: 'requestProcessPlayers',
    first_created: string
}

export interface ProcessPlayersResponse {
    event_name: 'processPlayersResponse',
    allowed: boolean
}