import { ApiError, Chat, Content, GenerateContentConfig, GoogleGenAI, HarmBlockThreshold, HarmCategory, ThinkingLevel } from "@google/genai";
import { AIService } from "./ai-client.interface.ts";
import { ReasoningLevel } from "./ai-config.interface.ts";
import { BotAction } from "../poker/bot-action.ts";
import { getPromptFromPlaystyle, parseResponse } from "./ai-query.helper.ts";
import { withTimeout } from "../../utils/bot-timeout.helper.ts";


const SAFETY_SETTINGS = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
];

// Registry reasoning level -> Gemini thinking level. Gemini 3 models always think,
// so there is no "off": "none" maps to MINIMAL, the floor, rather than omitting
// thinkingConfig and letting the model pick its own default.
const THINKING_LEVELS: Record<ReasoningLevel, ThinkingLevel> = {
    none: ThinkingLevel.MINIMAL,
    low: ThinkingLevel.LOW,
    medium: ThinkingLevel.MEDIUM,
    high: ThinkingLevel.HIGH
};

// A 400 from a model that doesn't accept the thinking level we asked for (levels
// are model-dependent — e.g. some Gemini 3 models take only low/high).
function isThinkingLevelUnsupported(err: unknown): boolean {
    return err instanceof ApiError && err.status === 400 && /think/i.test(err.message ?? "");
}

export class GoogleAIService extends AIService {
    private agent!: GoogleGenAI;
    // Chat-level config: applies to every message in the session. Gemini takes the
    // playstyle as systemInstruction rather than a message turn.
    private config!: GenerateContentConfig;
    private chat: Chat | null = null;
    // Latches once the model rejects the thinking level, so later hands don't
    // pay for the same failed round-trip.
    private thinking_unsupported: boolean = false;

    init(): void {
        this.agent = new GoogleGenAI({ apiKey: this.getAPIKey() });
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
        this.config = {
            systemInstruction: this.playstyle_prompt,
            safetySettings: SAFETY_SETTINGS,
            thinkingConfig: { thinkingLevel: THINKING_LEVELS[this.getReasoning()] }
        };
    }

    resetHand(): void {
        this.chat = null;
    }

    async query(input: string): Promise<BotAction> {
        const tag = `[${this.getBotName()}]`;
        console.log(tag, "input:", input);

        if (!this.chat) {
            this.chat = this.startChat();
        }

        let result;
        try {
            result = await this.send(this.chat, input);
        } catch (err) {
            if (this.thinking_unsupported || !isThinkingLevelUnsupported(err)) throw err;
            // The registry level isn't valid for this model. Drop it and let the
            // model use its own default, keeping the hand's history intact (a
            // failed sendMessage doesn't record the turn).
            console.warn(`${tag} thinking level unsupported on ${this.getModelName()}; retrying without it`);
            this.thinking_unsupported = true;
            this.chat = this.startChat(this.chat.getHistory());
            result = await this.send(this.chat, input);
        }

        const text_content = result.text;
        this.setLastRawResponse(text_content ?? ""); // reasoning + final answer; record-only, separate from parsed action
        if (text_content) console.log(tag, "raw:", text_content);
        return text_content ? parseResponse(text_content) : { action_str: "", bet_size_in_BBs: 0 };
    }

    private startChat(history?: Content[]): Chat {
        const config: GenerateContentConfig = { ...this.config };
        if (this.thinking_unsupported) delete config.thinkingConfig;
        return this.agent.chats.create({ model: this.getModelName(), config, history });
    }

    private send(chat: Chat, input: string) {
        return withTimeout(chat.sendMessage({ message: input }), this.getQueryTimeout(), "Google AI query");
    }
}
