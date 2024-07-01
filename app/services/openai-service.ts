import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";
import { AIService } from "../interfaces/ai-query-interfaces.ts";
import { playstyleToPrompt } from "../helpers/ai-query-helper.ts";

interface GPTResponse {
    choices: OpenAI.Chat.Completions.ChatCompletion.Choice,
    prevMessages: ChatCompletionMessageParam[]
}

//TODO: implement factory method for creating a generic AI service based on an interface
export class OpenAIService extends AIService {
    private agent!: OpenAI;

    init(): void {
        this.agent = new OpenAI({ apiKey: this.getAPIKey() });
    }
    
    //Takes an already created query and passes it into chatGPT if it is the first action,
    //otherwise attaches it to previous queries and feeds the entire conversation into chatGPT
    //TODO: refactor model as a parameter
    async query(input: string, prevMessages: ChatCompletionMessageParam[]): Promise<GPTResponse> {
        //console.log("before", prevMessages)
        if (prevMessages && prevMessages.length > 0) {
            prevMessages.push({ role: "user", content: input })
        } else {
            prevMessages = [
                { role: "system", content: playstyleToPrompt.get("pro")!},
                { role: "user", content: input }]
        }
    
        console.log("after", prevMessages)
        const completion = await this.agent.chat.completions.create({
            messages: prevMessages,
            model: "gpt-3.5-turbo",
        });
        
        return {
            choices: completion.choices[0],
            prevMessages: prevMessages
        }
    }
}