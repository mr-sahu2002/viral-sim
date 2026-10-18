import { GoogleGenAI, type Part } from '@google/genai';

export const MODELS = {
  flash: process.env.GEMINI_FLASH_MODEL || 'gemini-3.5-flash',
  pro: process.env.GEMINI_PRO_MODEL || 'gemini-3.1-pro-preview',
};

let client: GoogleGenAI | null = null;
function ai(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY / GOOGLE_API');
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

const MAX_CONCURRENT = Number(process.env.GEMINI_CONCURRENCY || 4);
let active = 0;
const queue: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => queue.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    queue.shift()?.();
  }
}

/** Structured-JSON Gemini call with retry on 429 / 5xx. */
export async function generateJson<T>(opts: {
  model: string;
  prompt: string;
  schema: object;
  image?: { mimeType: string; data: string };
  system?: string;
  temperature?: number;
}): Promise<T> {
  const parts: Part[] = [];
  if (opts.image) parts.push({ inlineData: opts.image });
  parts.push({ text: opts.prompt });

  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await slot(() =>
        ai().models.generateContent({
          model: opts.model,
          contents: [{ role: 'user', parts }],
          config: {
            systemInstruction: opts.system,
            temperature: opts.temperature ?? 0.9,
            responseMimeType: 'application/json',
            responseJsonSchema: opts.schema,
          },
        }),
      );
      return JSON.parse(res.text ?? '') as T;
    } catch (err) {
      lastErr = err;
      const msg = String(err);
      const retryable = /429|500|502|503|504|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|JSON/i.test(msg);
      if (!retryable) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt + Math.random() * 500));
    }
  }
  throw lastErr;
}
