import { AIService } from "../interfaces/ai-client-interfaces.ts";
import { OpenAIService } from "../services/openai-service.ts";

export class AIServiceFactory {
    private supportedModels: Map<string, string[]>;

    constructor(){
        this.supportedModels = new Map<string, string[]>([
            ["OpenAI", ["gpt-3.5-turbo", "gpt-4-turbo"]]
        ]);
    }

    createAIService(provider: string, model: string): AIService {
        if (!(this.supportedModels.has(provider) && this.supportedModels.get(provider)!.includes(model))) {
            throw new Error("AI provider or model not supported, please check the list of supported models.")
        }
        switch(provider) {
            case ("OpenAI"):
                const openai_auth_key = process.env.OPENAI_API_KEY;
                if (!openai_auth_key) {
                    throw new Error(`Invalid ${provider} auth key.`);
                }
                return new OpenAIService(openai_auth_key, model);
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