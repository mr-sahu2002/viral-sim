import type { SimEvent, SimInput } from './types';

const BASE = import.meta.env.VITE_API_BASE ?? '';

/** POSTs the simulation and invokes onEvent for each streamed SSE event. */
export async function simulate(input: SimInput, onEvent: (e: SimEvent) => void, signal?: AbortSignal) {
  const res = await fetch(`${BASE}/api/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!res.ok || !res.body) throw new Error((await res.text()) || `HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of chunk.split('\n')) if (line.startsWith('data: ')) onEvent(JSON.parse(line.slice(6)));
    }
  }
}

/** Downscale an image file to a JPEG of at most `max` px so the payload stays small. */
export function fileToImage(file: File, max = 1024): Promise<{ mimeType: string; data: string; url: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL('image/jpeg', 0.85);
      resolve({ mimeType: 'image/jpeg', data: url.split(',')[1], url });
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
