import Anthropic from "@anthropic-ai/sdk";
import { AIService, BotAction } from "./ai-client.interface.ts";
import { getPromptFromPlaystyle, parseResponse } from "./ai-query.helper.ts";
import { withTimeout } from "../../utils/bot-timeout.helper.ts";

const AI_QUERY_TIMEOUT_MS = 20000;
const MAX_TOKENS = 1024;

export class ClaudeAIService extends AIService {
    private agent!: Anthropic;
    // Conversation turns for the current hand. Claude takes the playstyle as the
    // top-level `system` prompt (not a message), so this holds only user/assistant turns.
    private messages: Anthropic.MessageParam[] = [];

    init(): void {
        this.agent = new Anthropic({ apiKey: this.getAPIKey() });
        try {
            this.playstyle_prompt = getPromptFromPlaystyle(this.getPlaystyle());
        } catch (err) {
            console.log(err);
        }
    }

    resetHand(): void {
        this.messages = [];
    }

    async query(input: string): Promise<BotAction> {
        const tag = `[${this.getBotName()}]`;
        console.log(tag, "input:", input);

        this.messages.push({ role: "user", content: input });

        const response = await withTimeout(
            this.agent.messages.create({
                model: this.getModelName(),
                max_tokens: MAX_TOKENS,
                system: this.playstyle_prompt,
                messages: this.messages,
            }),
            AI_QUERY_TIMEOUT_MS,
            "Claude AI query"
        );

        const text = response.content
            .filter((block): block is Anthropic.TextBlock => block.type === "text")
            .map((block) => block.text)
            .join("");

        if (text) {
            this.messages.push({ role: "assistant", content: text });
            return parseResponse(text);
        }
        return { action_str: "", bet_size_in_BBs: 0 };
    }
}
