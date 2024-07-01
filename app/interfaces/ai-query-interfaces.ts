export interface AIMessage {
    text_content: string,
    metadata: any
}

export interface AIResponse {
    bot_action: BotAction,
    prev_messages: AIMessage[],
    curr_message: AIMessage
}

export interface BotAction {
    action_str: string,
    bet_size_in_BBs: number
}

export abstract class AIService {
    private api_key: string;

    constructor(api_key: string) {
        this.api_key = api_key;
    }

    abstract init(): void;
    abstract query(input: string, prev_messages: AIMessage[]): Promise<any>;
    abstract processMessages(messages: AIMessage[]): Array<any>;

    getAPIKey(): string {
        return this.api_key;
    }
}