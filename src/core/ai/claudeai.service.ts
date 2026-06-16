import Anthropic from "@anthropic-ai/sdk";
import { AIService, BotAction } from "./ai-client.interface.ts";
import { getPromptFromPlaystyle, parseResponse } from "./ai-query.helper.ts";
import { withTimeout } from "../../utils/bot-timeout.helper.ts";

const AI_QUERY_TIMEOUT_MS = 20000;
const MAX_TOKENS = 4096; // headroom for visible reasoning + the Final Answer line
// Thinking tokens count toward max_tokens, so give reasoning runs more room.
const REASONING_MAX_TOKENS = 8192;

// A 400 from a model that doesn't support adaptive thinking / effort (e.g. Haiku).
function isReasoningUnsupported(err: unknown): boolean {
    return err instanceof Anthropic.APIError && err.status === 400 && /thinking|effort/i.test(err.message ?? "");
}

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
        const reasoning = this.getReasoning();

        const base: Anthropic.MessageCreateParamsNonStreaming = {
            model: this.getModelName(),
            max_tokens: MAX_TOKENS,
            system: this.playstyle_prompt,
            messages: this.messages,
        };

        let response: Anthropic.Message;
        if (reasoning !== "none") {
            // Adaptive thinking + effort (Opus 4.6+ / Sonnet 4.6). Models that
            // don't support it (Haiku 4.5, Sonnet 4.5) should be "none" in the
            // registry; the retry below is a safety net if one slips through.
            const withReasoning: Anthropic.MessageCreateParamsNonStreaming = {
                ...base,
                max_tokens: REASONING_MAX_TOKENS,
                thinking: { type: "adaptive" },
                output_config: { effort: reasoning },
            };
            try {
                response = await withTimeout(this.agent.messages.create(withReasoning), AI_QUERY_TIMEOUT_MS, "Claude AI query");
            } catch (err) {
                if (!isReasoningUnsupported(err)) throw err;
                console.warn(`${tag} adaptive thinking unsupported on ${this.getModelName()}; retrying without reasoning`);
                response = await withTimeout(this.agent.messages.create(base), AI_QUERY_TIMEOUT_MS, "Claude AI query");
            }
        } else {
            response = await withTimeout(this.agent.messages.create(base), AI_QUERY_TIMEOUT_MS, "Claude AI query");
        }

        const text = response.content
            .filter((block): block is Anthropic.TextBlock => block.type === "text")
            .map((block) => block.text)
            .join("");

        if (text) {
            console.log(tag, "raw:", text); // reasoning + final answer, for audit
            this.messages.push({ role: "assistant", content: text });
            return parseResponse(text);
        }
        return { action_str: "", bet_size_in_BBs: 0 };
    }
}
