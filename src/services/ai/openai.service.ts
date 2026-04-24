import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";
import { AIService, BotAction } from "./ai-client.interface.ts";
import { getPromptFromPlaystyle, parseResponse} from "./ai-query.helper.ts";
import { withTimeout } from "../../utils/bot-timeout.helper.ts";

const AI_QUERY_TIMEOUT_MS = 30000;

export class OpenAIService extends AIService {
    private agent!: OpenAI;
    private messages: ChatCompletionMessageParam[] = [];

    init(): void {
        this.agent = new OpenAI({ apiKey: this.getAPIKey() });
        try {
            this.playstyle_prompt = getPromptFromPlaystyle(this.getPlaystyle());
        } catch (err) {
            console.log(err);
        }
    }

    resetHand(): void {
        this.messages = [{ role: "system", content: this.playstyle_prompt }];
    }

    async query(input: string): Promise<BotAction> {
        const tag = `[${this.getBotName()}]`;
        console.log(tag, "input:", input);

        if (this.messages.length === 0) {
            this.resetHand();
        }
        this.messages.push({ role: "user", content: input });

        const completion = await withTimeout(
            this.agent.chat.completions.create({
                messages: this.messages,
                model: this.getModelName()
            }),
            AI_QUERY_TIMEOUT_MS,
            "OpenAI query"
        );

        const response_msg = completion.choices[0].message;
        if (response_msg.content) {
            this.messages.push({ role: "assistant", content: response_msg.content });
            return parseResponse(response_msg.content);
        }
        return { action_str: "", bet_size_in_BBs: 0 };
    }
}
