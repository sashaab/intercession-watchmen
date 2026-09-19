import OpenAI, { toFile } from "openai";
import { config } from "../config.js";

export async function transcribeAudio(
  buffer: Buffer,
  filename = "voice.ogg",
): Promise<string> {
  if (!config.openaiApiKey) {
    throw new Error(
      "Voice transcription needs OPENAI_API_KEY (Whisper / compatible API).",
    );
  }

  const client = new OpenAI({
    apiKey: config.openaiApiKey,
    ...(config.openaiBaseUrl ? { baseURL: config.openaiBaseUrl } : {}),
  });

  const result = await client.audio.transcriptions.create({
    file: await toFile(buffer, filename),
    model: config.openaiTranscribeModel,
  });

  const text = (result.text || "").trim();
  if (!text) {
    throw new Error("Transcription came back empty. Try again more clearly.");
  }
  return text;
}
