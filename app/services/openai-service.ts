import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";

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

export interface GPTResponse {
  choices: OpenAI.Chat.Completions.ChatCompletion.Choice[],
  prevMessages: ChatCompletionMessageParam[]
}