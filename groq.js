import { GROQ_API_KEY } from "./config.js";
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
        { role: "system", content: systemPrompt + " Never wrap your messages in quotes. Write like you're actually texting, no quotation marks." },
        ...messages
      ],
      max_tokens: 200,
      temperature: 0.9
    })
  });

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content || "...";
  return raw.replace(/^[""]|[""]$/g, "").trim();
}

import { ELEVENLABS_API_KEY } from "./config.js";

// Scammers get a different voice ID to sound off
// ---- keep everything above this line unchanged ----

const VOICE_NORMAL = "21m00Tcm4TlvDq8ikWAM";
const VOICE_SCAMMER = "TxGEqnHWrfWFTfGW9XjX";

let currentAudio = null;                         // ← NEW

export function stopSpeaking() {                 // ← NEW
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
}

export async function speakWithElevenLabs(text, isScammer) {   // ← REPLACED
  const voiceId = isScammer ? VOICE_SCAMMER : VOICE_NORMAL;
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
    currentAudio.addEventListener("ended", () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      resolve();
    });
  });
}