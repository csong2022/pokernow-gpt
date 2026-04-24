import OpenAI from "openai";
import { AIService, BotAction } from "../../interfaces/ai-client.interface.ts";
import { getPromptFromPlaystyle, parseResponse} from "../../helpers/ai-query.helper.ts";
import { withTimeout } from "../../helpers/bot-timeout.helper.ts";

const AI_QUERY_TIMEOUT_MS = 30000;

export class OpenAIService extends AIService {
    private agent!: OpenAI;

    init(): void {
        this.agent = new OpenAI({ apiKey: this.getAPIKey() });
        try {
            this.playstyle_prompt = getPromptFromPlaystyle(this.getPlaystyle());
        } catch (err) {
            console.log(err);
        }
    }

    async query(input: string): Promise<BotAction> {
        const tag = `[${this.getBotName()}]`;
        console.log(tag, "input:", input);

        const completion = await withTimeout(
            this.agent.chat.completions.create({
                messages: [
                    { role: "system", content: this.playstyle_prompt },
                    { role: "user", content: input }
                ],
                model: this.getModelName()
            }),
            AI_QUERY_TIMEOUT_MS,
            "OpenAI query"
        );

        const text_content = completion.choices[0].message.content;
        return text_content ? parseResponse(text_content) : { action_str: "", bet_size_in_BBs: 0 };
    }
}
