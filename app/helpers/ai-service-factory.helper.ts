import { AIService } from "../interfaces/ai-client.interface.ts";
import { GoogleAIService } from "../services/ai/googleai.service.ts";
import { OpenAIService } from "../services/ai/openai.service.ts";

export class AIServiceFactory {
    private supportedModels: Map<string, string[]>;

    constructor(){
        this.supportedModels = new Map<string, string[]>([
            ["OpenAI", ["gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"]],
            ["Google", ["gemini-3.1-pro-preview", "gemini-3-flash-preview", "gemini-3.1-flash-lite-preview"]]
        ]);
    }

    createAIService(provider: string, model_name: string, playstyle: string = "neutral"): AIService {
        if (!(this.supportedModels.has(provider) && this.supportedModels.get(provider)!.includes(model_name))) {
            throw new Error("AI provider or model not supported, please check the list of supported models.")
        }
        switch(provider) {
            case ("OpenAI"):
                const open_ai_auth_key = process.env.OPENAI_API_KEY;
                if (!open_ai_auth_key) {
                    throw new Error(`Empty ${provider} auth key.`);
                }
                return new OpenAIService(open_ai_auth_key, model_name, playstyle);
            case ("Google"):
                const google_ai_auth_key = process.env.GOOGLEAI_API_KEY;
                if (!google_ai_auth_key) {
                    throw new Error (`Empty ${provider} auth key.`);
                }
                return new GoogleAIService(google_ai_auth_key, model_name, playstyle);
        }
        throw new Error("Failed to create AI service.");
    }

    printSupportedModels(): void {
        console.log("Supported models:")
        for (const provider of Array.from(this.supportedModels.keys())) {
            let out = provider.concat(": ");
            out = out.concat(this.supportedModels.get(provider)!.join(", "));
            console.log(out);
        }
    }
}