const GROQ_API_KEY = "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"; // replace with your new key
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function sendToGroq(messages, systemPrompt) {
  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages
      ],
      max_tokens: 200,
      temperature: 0.9
    })
  });

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "...";
}