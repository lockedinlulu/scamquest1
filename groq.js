import { GROQ_API_KEY, ELEVENLABS_API_KEY } from "./config.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function sendToGroq(messages, systemPrompt, retries = 5, delay = 8000) {
  for (let i = 0; i < retries; i++) {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemPrompt + " Never wrap your messages in quotes. Write like you're actually texting, no quotation marks." },
          ...messages
        ],
        max_tokens: 200,
        temperature: 0.9
      })
    });

    if (response.status === 429) {
      console.warn(`⚠️ Rate limited. Retrying in ${delay / 1000}s... (attempt ${i + 1}/${retries})`);
      await new Promise(r => setTimeout(r, delay));
      delay *= 1.5;
      continue;
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "...";
    return raw.replace(/^[""]|[""]$/g, "").trim();
  }

  return "Hey, how's it going?";
}

const VOICE_FEMALE = "21m00Tcm4TlvDq8ikWAM";
const VOICE_MALE   = "TxGEqnHWrfWFTfGW9XjX";

let currentAudio = null;
let currentResolve = null;

export function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
  if (currentResolve) {
    currentResolve();
    currentResolve = null;
  }
}

export async function speakWithElevenLabs(text, isFemale) {
  const voiceId = isFemale ? VOICE_FEMALE : VOICE_MALE;
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": ELEVENLABS_API_KEY
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_turbo_v2",
      voice_settings: { stability: 0.4, similarity_boost: 0.75 }
    })
  });

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  currentAudio = new Audio(url);
  await currentAudio.play();
  return new Promise(resolve => {
    currentResolve = resolve;
    currentAudio.addEventListener("ended", () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      currentResolve = null;
      resolve();
    });
  });
}