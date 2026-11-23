import { createApp } from './server/createApp';

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = await createApp();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NOVA AGENT server listening on http://localhost:${PORT}`);
  });
}

startServer();
