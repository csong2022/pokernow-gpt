import { AIService } from "./ai-client.interface.ts";
import { ClaudeAIService } from "./claudeai.service.ts";
import { GoogleAIService } from "./googleai.service.ts";
import { OpenAIService } from "./openai.service.ts";

// Routes a provider to its concrete AIService. Model validity is owned by the
// model registry (config/models.json), resolved at the composition root — the
// factory no longer keeps a hardcoded model allowlist (that drifted from the
// providers' real model sets).
export class AIServiceFactory {
    createAIService(provider: string, model_name: string, playstyle: string = "neutral"): AIService {
        switch (provider) {
            case "OpenAI": {
                const key = process.env.OPENAI_API_KEY;
                if (!key) throw new Error(`Empty ${provider} auth key.`);
                return new OpenAIService(key, model_name, playstyle);
            }
            case "Google": {
                const key = process.env.GOOGLEAI_API_KEY;
                if (!key) throw new Error(`Empty ${provider} auth key.`);
                return new GoogleAIService(key, model_name, playstyle);
            }
            case "Anthropic": {
                const key = process.env.CLAUDEAI_API_KEY;
                if (!key) throw new Error(`Empty ${provider} auth key.`);
                return new ClaudeAIService(key, model_name, playstyle);
            }
            default:
                throw new Error(`Unsupported AI provider: ${provider}`);
        }
    }
}
