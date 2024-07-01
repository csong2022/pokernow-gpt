import dotenv from "dotenv";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";

export interface BotAction {
    action_str: string,
    bet_size_in_BBs: number
}

interface GPTResponse {
    choices: OpenAI.Chat.Completions.ChatCompletion.Choice,
    prevMessages: ChatCompletionMessageParam[]
}

//TODO: implement factory method for creating a generic AI service based on an interface
export class OpenAIService {
    private agent!: OpenAI;

    constructor() {
    }

    async init() {
        dotenv.config();
        this.agent = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    
    async queryGPT(query: string, prevMessages: ChatCompletionMessageParam[]): Promise<GPTResponse> {
        console.log("before", prevMessages)
        if (prevMessages && prevMessages.length > 0) {
            prevMessages.push({ role: "system", content: query })
        } else {
            prevMessages = [{ role: "system", content: query }]
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