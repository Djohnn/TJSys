import { createServer } from 'vite';
import rendererConfig from '../vite.renderer.config';
import { PDV_BASE_URL } from './config';

export default async function globalSetup() {
  if (process.env.E2E_LIVE_PDV === '1') {
    return async () => undefined;
  }

  const origin = new URL(PDV_BASE_URL);
  const server = await createServer({
    ...rendererConfig,
    server: {
      ...rendererConfig.server,
      host: origin.hostname,
      port: Number(origin.port || 80),
    },
  });

  await server.listen();

  return async () => {
    await server.close();
  };
}
