import { GenerativeModel, GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import { AIService, BotAction } from "../../interfaces/ai-client.interface.ts";
import { getPromptFromPlaystyle, parseResponse } from "../../helpers/ai-query.helper.ts";
import { withTimeout } from "../../helpers/bot-timeout.helper.ts";

const AI_QUERY_TIMEOUT_MS = 30000;

const SAFETY_SETTINGS = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
];

export class GoogleAIService extends AIService {
    private agent!: GoogleGenerativeAI;
    private model!: GenerativeModel;

    init(): void {
        this.agent = new GoogleGenerativeAI(this.getAPIKey());
        try {
            this.playstyle_prompt = getPromptFromPlaystyle(this.getPlaystyle());
        } catch (err) {
            console.log(err);
        }
        this.model = this.agent.getGenerativeModel({
            model: this.getModelName(),
            systemInstruction: this.playstyle_prompt,
            safetySettings: SAFETY_SETTINGS
        });
    }

    async query(input: string): Promise<BotAction> {
        const tag = `[${this.getBotName()}]`;
        console.log(tag, "input:", input);

        const result = await withTimeout(
            this.model.generateContent(input),
            AI_QUERY_TIMEOUT_MS,
            "Google AI query"
        );
        const text_content = result.response.text();

        return text_content ? parseResponse(text_content) : { action_str: "", bet_size_in_BBs: 0 };
    }
}
