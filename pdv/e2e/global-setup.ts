import { createServer } from 'vite';
import rendererConfig from '../vite.renderer.config';

export default async function globalSetup() {
  if (process.env.E2E_LIVE_PDV === '1') {
    return async () => undefined;
  }

  const server = await createServer({
    ...rendererConfig,
    server: {
      ...rendererConfig.server,
      port: 5173,
    },
  });

  await server.listen();

  return async () => {
    await server.close();
  };
}
