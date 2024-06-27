import dotenv from "dotenv";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";

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

    //console.log("response 0", completion.choices[0]);
    return {
        choices: completion.choices[0],
        prevMessages: prevMessages
    }
}

export function parseResponse(msg: string) {
    msg = msg.slice(1, -1);
    const msg_arr = msg.split(',');
    console.log("Message Array:", msg_arr);
    const bet_size_str = msg_arr[1];
    const matches = bet_size_str.match(/[+]?([0-9]+(?:[\.][0-9]*)?|\.[0-9]+)/);
    let bet_size_in_BBs = 0;
    if (matches) {
        bet_size_in_BBs = parseFloat(matches[0]);
    }
    return {
        action_str: msg_arr[0].toLowerCase(),
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