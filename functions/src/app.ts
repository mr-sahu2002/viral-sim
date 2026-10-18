import cors from 'cors';
import express from 'express';
import { MODELS } from './gemini.js';
import { runSimulation } from './simulate.js';
import type { SimEvent, SimInput } from './types.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, models: MODELS }));

  // Streams simulation events as Server-Sent Events.
  app.post('/api/simulate', async (req, res) => {
    const body = req.body as SimInput;
    if (!body?.text?.trim() && !body?.image) return res.status(400).json({ error: 'Post text or image is required' });
    if (!['linkedin', 'x', 'instagram'].includes(body.platform)) return res.status(400).json({ error: 'Invalid platform' });

    const input: SimInput = {
      ...body,
      text: body.text ?? '',
      audience: body.audience?.trim() || 'General professional audience',
      population: Math.max(10, Math.min(Number(body.population) || 100, 200)),
      seeds: Math.max(1, Math.min(Number(body.seeds) || 6, 30)),
    };

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    let closed = false;
    res.on('close', () => (closed = true));
    const emit = (e: SimEvent) => {
      if (!closed) res.write(`data: ${JSON.stringify(e)}\n\n`);
    };
    const ping = setInterval(() => !closed && res.write(': ping\n\n'), 15000);

    try {
      await runSimulation(input, emit);
    } catch (err) {
      console.error(err);
      emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      clearInterval(ping);
      res.end();
    }
  });

  return app;
}
