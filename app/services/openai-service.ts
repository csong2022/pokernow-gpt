import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";
import { AIMessage, AIResponse, AIService, BotAction } from "../interfaces/ai-client-interfaces.ts";
import { parseResponse, playstyleToPrompt } from "../helpers/ai-query-helper.ts";

export class OpenAIService extends AIService {
    private agent!: OpenAI;

    init(): void {
        this.agent = new OpenAI({ apiKey: this.getAPIKey() });
    }
    
    //takes an already created query and passes it into chatGPT if it is the first action,
    //otherwise attaches it to previous queries and feeds the entire conversation into chatGPT
    async query(input: string, prev_messages: AIMessage[]): Promise<AIResponse> {
        if (prev_messages && prev_messages.length > 0) {
            if (input !== prev_messages[prev_messages.length - 1].text_content) {
                prev_messages.push({text_content: input, metadata: {"role": "user"}});
            }
        } else {
            prev_messages = [
                {text_content: playstyleToPrompt.get("pro")!, metadata: {"role": "system"}},
                {text_content: input, metadata: {"role": "user"}}
            ];
        }
    
        const processed_messages = this.processMessages(prev_messages);
        console.log("after", processed_messages);
        const completion = await this.agent.chat.completions.create({
            messages: processed_messages,
            model: this.getModel()
        });

        const choice = completion.choices[0];
        const message = choice.message;
        const text_content = message.content;

        let bot_action: BotAction = {
            action_str: "",
            bet_size_in_BBs: 0
        };;

        if (choice && text_content) {
            bot_action = parseResponse(text_content);
        }

        return {
            bot_action: bot_action,
            prev_messages: prev_messages,
            curr_message: {
                text_content: text_content!,
                metadata: {
                    "role": message.role
                }
            }
        }
    }

    processMessages(messages: AIMessage[]): ChatCompletionMessageParam[] {
        const output: ChatCompletionMessageParam[] = [];
        for (const message of messages) {
            output.push({
                role: message.metadata.role,
                content: message.text_content
            })
        }
        return output;
    }
}