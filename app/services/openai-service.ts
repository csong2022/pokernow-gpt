import dotenv from "dotenv";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";
import { processOutput } from "../utils/ai-query-utils.ts";

//TODO: init function here
export async function init() {
    
}
dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function queryGPT(query: string, prevMessages: ChatCompletionMessageParam[]) {
    console.log("before", prevMessages)
    if (prevMessages && prevMessages.length > 0) {
        prevMessages.push({ role: "system", content: query })
    } else {
        prevMessages = [{ role: "system", content: query }]
    }

    console.log("after", prevMessages)
    const completion = await openai.chat.completions.create({
        messages: prevMessages,
        model: "gpt-3.5-turbo",
    });
    
    return {
        choices: completion.choices[0],
        prevMessages: prevMessages
    }
}

export function parseResponse(msg: string) {
    msg = processOutput(msg);

    const action_matches = msg.match(/(bet|raise|call|check|fold)/);
    let action_str = "";
    if (action_matches) {
        action_str = action_matches[0];
    }

    const bet_size_matches = msg.match(/[+]?([0-9]+(?:[\.][0-9]*)?|\.[0-9]+)/);
    let bet_size_in_BBs = 0;
    if (bet_size_matches) {
        bet_size_in_BBs = parseFloat(bet_size_matches[0]);
    }
    return {
        action_str: action_str,
        bet_size_in_BBs: bet_size_in_BBs
    }
}

export interface BotAction {
    action_str: string,
    bet_size_in_BBs: number
}

export interface GPTResponse {
    choices: OpenAI.Chat.Completions.ChatCompletion.Choice[],
    prevMessages: ChatCompletionMessageParam[]
}