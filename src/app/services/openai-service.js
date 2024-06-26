import OpenAI from "openai";

const openai = new OpenAI();

export async function main(query) {
  const completion = await openai.chat.completions.create({
    messages: [{ role: "system", content: query }],
    model: "gpt-3.5-turbo",
  });

  console.log(completion.choices[0]);
  return completion.choices;
}

msg = "You are a helpful assistant.";
main(msg);