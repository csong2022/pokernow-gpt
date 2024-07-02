import { Content, GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import { AIMessage, AIResponse, AIService, BotAction } from "../../interfaces/ai-client-interfaces.ts";
import { getPromptFromPlaystyle, parseResponse } from "../../helpers/ai-query-helper.ts";

export class GoogleAIService extends AIService {
    private agent!: GoogleGenerativeAI;

    init(): void {
        this.agent = new GoogleGenerativeAI(this.getAPIKey());
    }
    
    //takes an already created query and passes it into chatGPT if it is the first action,
    //otherwise attaches it to previous queries and feeds the entire conversation into chatGPT
    async query(input: string, prev_messages: AIMessage[]): Promise<AIResponse> {
        if (prev_messages.length == 0) {
            try {
                const playstyle_prompt = getPromptFromPlaystyle(this.getPlaystyle());
                prev_messages = [{text_content: playstyle_prompt, metadata: {"role": "user"}}];
            } catch (err) {
                console.log(err);
            }
        }

        console.log("prev_messages:", prev_messages);
        console.log("input:", input)
        const processed_messages = this.processMessages(prev_messages);

        const safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
        ]
        const model = this.agent.getGenerativeModel({ 
            model: this.getModelName(),
            safetySettings
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