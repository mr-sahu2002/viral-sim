import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { createApp } from './app.js';

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const app = createApp();

export const api = onRequest(
  { secrets: [GEMINI_API_KEY], timeoutSeconds: 540, memory: '512MiB', region: 'us-central1', cors: true },
  (req, res) => {
    process.env.GEMINI_API_KEY ??= GEMINI_API_KEY.value();
    return app(req, res);
  },
);
