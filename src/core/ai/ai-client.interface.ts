export abstract class AIService {
    private api_key: string;
    private model_name: string;
    private playstyle: string;
    private bot_name: string = "";
    protected playstyle_prompt: string = "";

    constructor(api_key: string, model: string, playstyle: string) {
        this.api_key = api_key;
        this.model_name = model;
        this.playstyle = playstyle;
    }

    abstract init(): void;
    abstract resetHand(): void;
    abstract query(input: string): Promise<BotAction>;

    getAPIKey(): string {
        return this.api_key;
    }

    getModelName(): string {
        return this.model_name;
    }

    getPlaystyle(): string {
        return this.playstyle;
    }

    setBotName(bot_name: string): void {
        this.bot_name = bot_name;
    }

    getBotName(): string {
        return this.bot_name;
    }
}

export interface BotAction {
    action_str: string,
    bet_size_in_BBs: number
}

export const defaultCheckAction = {
    action_str: "check",
    bet_size_in_BBs: 0
}

export const defaultFoldAction = {
    action_str: "fold",
    bet_size_in_BBs: 0
}
