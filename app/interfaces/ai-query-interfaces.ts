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
    abstract query(input: string, prevMessages?: any): Promise<any>;

    getAPIKey(): string {
        return this.api_key;
    }
}