import { ReasoningLevel } from "./ai-config.interface.ts";

export abstract class AIService {
    private api_key: string;
    private model_name: string;
    private playstyle: string;
    private reasoning: ReasoningLevel;
    private bot_name: string = "";
    protected playstyle_prompt: string = "";
    // Optional raw system-prompt override (arena probe-only); empty = use playstyle.
    private system_prompt_override: string;
    // Per-query timeout (ms). Live derives this from the table action clock; the
    // arena leaves the generous default since it has no clock.
    private query_timeout_ms: number;
    // The full raw text of the most recent model response (reasoning + final-answer
    // line). Record-only: surfaced for logging/replay, never read back into game state.
    private last_raw_response: string = "";

    constructor(api_key: string, model: string, playstyle: string, reasoning: ReasoningLevel = "none", system_prompt_override: string = "", query_timeout_ms: number = 20000) {
        this.api_key = api_key;
        this.model_name = model;
        this.playstyle = playstyle;
        this.reasoning = reasoning;
        this.system_prompt_override = system_prompt_override;
        this.query_timeout_ms = query_timeout_ms;
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

    getReasoning(): ReasoningLevel {
        return this.reasoning;
    }

    // Raw system-prompt override, or "" to fall back to the playstyle prompt.
    getSystemPromptOverride(): string {
        return this.system_prompt_override;
    }

    // Per-query timeout in ms (providers wrap their API call in this).
    getQueryTimeout(): number {
        return this.query_timeout_ms;
    }

    setBotName(bot_name: string): void {
        this.bot_name = bot_name;
    }

    getBotName(): string {
        return this.bot_name;
    }

    // Providers call this with the raw response text before parsing; consumers read
    // it right after query() for per-decision logging.
    protected setLastRawResponse(raw: string): void {
        this.last_raw_response = raw;
    }
    getLastRawResponse(): string {
        return this.last_raw_response;
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
