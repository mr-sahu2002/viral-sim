import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Local dev only: load the key from the project-root .env.
config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

const { createApp } = await import('./app.js');
const port = Number(process.env.PORT || 8787);
createApp().listen(port, () => console.log(`viral-sim API on http://localhost:${port}`));
