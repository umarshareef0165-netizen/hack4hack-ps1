import { connectDb } from './db';
import { createApp } from './app';

const PORT = Number(process.env.PORT ?? 4000);

async function main(): Promise<void> {
  await connectDb();
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`[server] hack4hack-ps1 API listening on http://localhost:${PORT}`);
    console.log(`[server] health: http://localhost:${PORT}/health`);
  });
}

main().catch((err) => {
  console.error('[server] fatal', err);
  process.exit(1);
});
