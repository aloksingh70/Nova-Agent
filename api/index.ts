import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../server/createApp';

let appPromise: ReturnType<typeof createApp> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!appPromise) {
    appPromise = createApp({ isServerless: true });
  }
  const app = await appPromise;
  return app(req, res);
}
