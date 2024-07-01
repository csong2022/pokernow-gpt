import { Content, GoogleGenerativeAI } from "@google/generative-ai";
import { AIMessage, AIResponse, AIService, BotAction } from "../../interfaces/ai-client-interfaces.ts";
import { parseResponse, playstyleToPrompt } from "../../helpers/ai-query-helper.ts";

export class GoogleAIService extends AIService {
    private agent!: GoogleGenerativeAI;

    init(): void {
        this.agent = new GoogleGenerativeAI(this.getAPIKey());
    }
    
    //takes an already created query and passes it into chatGPT if it is the first action,
    //otherwise attaches it to previous queries and feeds the entire conversation into chatGPT
    async query(input: string, prev_messages: AIMessage[]): Promise<AIResponse> {
        if (prev_messages === undefined || prev_messages.length == 0) {
            prev_messages = [{text_content: playstyleToPrompt.get("pro")!, metadata: {"role": "user"}}];
        }

        console.log("prev_messages:", prev_messages);
        console.log("input:", input)
        const processed_messages = this.processMessages(prev_messages);
        const model = this.agent.getGenerativeModel({ 
            model: this.getModelName()
        });


        const chat = model.startChat({
            history: processed_messages
        })

        const result = await chat.sendMessage(input);
        const response = result.response;
        const text_content = response.text();

        let bot_action: BotAction = {
            action_str: "",
            bet_size_in_BBs: 0
        };;

        if (response && text_content) {
            bot_action = parseResponse(text_content);
        }

        if (input !== prev_messages[prev_messages.length - 1].text_content) {
            prev_messages.push({text_content: input, metadata: {"role": "user"}});
        }

        return {
            bot_action: bot_action,
            prev_messages: prev_messages,
            curr_message: {
                text_content: text_content!,
                metadata: {
                    "role": "model"
                }
            }
        }
    }

    processMessages(messages: AIMessage[]): Content[] {
        const output: Content[] = [];
        for (const message of messages) {
            output.push({
                role: message.metadata.role,
                parts: [{ text: message.text_content }]
            })
        }
        return output;
    }
}