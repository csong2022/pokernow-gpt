import OpenAI from "openai";

const openai = new OpenAI();

export async function queryGPT(query, prevMessages) {
  console.log("before", prevMessages)
  if (prevMessages != null) {
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
  return [completion.choices[0], prevMessages];
}