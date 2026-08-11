import { createServer } from 'vite';
import rendererConfig from '../vite.renderer.config';

export default async function globalSetup() {
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
