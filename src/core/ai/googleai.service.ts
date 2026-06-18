import { ChatSession, GenerativeModel, GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import { AIService, BotAction } from "./ai-client.interface.ts";
import { getPromptFromPlaystyle, parseResponse } from "./ai-query.helper.ts";
import { withTimeout } from "../../utils/bot-timeout.helper.ts";


const SAFETY_SETTINGS = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
];

// Note: the pinned @google/generative-ai SDK (0.14.1) exposes no thinkingConfig,
// so the registry `reasoning` level can't be applied here — Gemini 3 models
// reason automatically. Upgrading to @google/genai would let us set it explicitly.
export class GoogleAIService extends AIService {
    private agent!: GoogleGenerativeAI;
    private model!: GenerativeModel;
    private chat: ChatSession | null = null;

    init(): void {
        this.agent = new GoogleGenerativeAI(this.getAPIKey());
        const override = this.getSystemPromptOverride();
        if (override) {
            this.playstyle_prompt = override;
        } else {
            try {
                this.playstyle_prompt = getPromptFromPlaystyle(this.getPlaystyle());
            } catch (err) {
                console.log(err);
            }
        }
        this.model = this.agent.getGenerativeModel({
            model: this.getModelName(),
            systemInstruction: this.playstyle_prompt,
            safetySettings: SAFETY_SETTINGS
        });
    }

    resetHand(): void {
        this.chat = null;
    }

    async query(input: string): Promise<BotAction> {
        const tag = `[${this.getBotName()}]`;
        console.log(tag, "input:", input);

        if (!this.chat) {
            this.chat = this.model.startChat();
        }

        const result = await withTimeout(
            this.chat.sendMessage(input),
            this.getQueryTimeout(),
            "Google AI query"
        );
        const text_content = result.response.text();
        this.setLastRawResponse(text_content ?? ""); // reasoning + final answer; record-only, separate from parsed action
        if (text_content) console.log(tag, "raw:", text_content);
        return text_content ? parseResponse(text_content) : { action_str: "", bet_size_in_BBs: 0 };
    }
}
