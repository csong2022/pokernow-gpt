import { AIService } from "./ai-client.interface.ts";
import { ReasoningLevel } from "./ai-config.interface.ts";
import { ClaudeAIService } from "./claudeai.service.ts";
import { GoogleAIService } from "./googleai.service.ts";
import { OpenAIService } from "./openai.service.ts";

// Routes a provider to its concrete AIService. Model validity is owned by the
// model registry (config/models.json), resolved at the composition root — the
// factory no longer keeps a hardcoded model allowlist (that drifted from the
// providers' real model sets).
export class AIServiceFactory {
    createAIService(provider: string, model_name: string, playstyle: string = "neutral", reasoning: ReasoningLevel = "none", systemPrompt: string = "", queryTimeoutMs: number = 20000): AIService {
        switch (provider) {
            case "OpenAI": {
                const key = process.env.OPENAI_API_KEY;
                if (!key) throw new Error(`Empty ${provider} auth key.`);
                return new OpenAIService(key, model_name, playstyle, reasoning, systemPrompt, queryTimeoutMs);
            }
            case "Google": {
                const key = process.env.GOOGLEAI_API_KEY;
                if (!key) throw new Error(`Empty ${provider} auth key.`);
                return new GoogleAIService(key, model_name, playstyle, reasoning, systemPrompt, queryTimeoutMs);
            }
            case "Anthropic": {
                const key = process.env.CLAUDEAI_API_KEY;
                if (!key) throw new Error(`Empty ${provider} auth key.`);
                return new ClaudeAIService(key, model_name, playstyle, reasoning, systemPrompt, queryTimeoutMs);
            }
            default:
                throw new Error(`Unsupported AI provider: ${provider}`);
        }
    }
}
