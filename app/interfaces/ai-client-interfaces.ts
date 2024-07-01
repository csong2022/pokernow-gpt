export interface AIMessage {
    text_content: string,
    metadata: any
}

export interface AIResponse {
    bot_action: BotAction,
    prev_messages: AIMessage[],
    curr_message: AIMessage
}

export abstract class AIService {
    private api_key: string;
    private model_name: string;

    constructor(api_key: string, model: string) {
        this.api_key = api_key;
        this.model_name = model;
    }

    abstract init(): void;
    abstract query(input: string, prev_messages: AIMessage[]): Promise<any>;
    abstract processMessages(messages: AIMessage[]): Array<any>;

    getAPIKey(): string {
        return this.api_key;
    }

    getModelName(): string {
        return this.model_name;
    }
}

export interface BotAction {
    action_str: string,
    bet_size_in_BBs: number
}