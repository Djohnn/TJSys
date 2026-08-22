import { createServer } from 'vite';
import rendererConfig from '../vite.renderer.config';
import { EXTERNAL_SERVER, PDV_BASE_URL } from './config';

async function assertExternalServer() {
  try {
    const response = await fetch(PDV_BASE_URL)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const html = await response.text()
    if (!/<title>\s*Zyrp PDV\s*<\/title>/i.test(html)) {
      throw new Error('identidade PDV ausente: esperado <title>Zyrp PDV</title>')
    }
  } catch (error) {
    throw new Error(`E2E_EXTERNAL_SERVER=1 exige servidor PDV saudável em ${PDV_BASE_URL}: ${String(error)}`)
  }
}

export default async function globalSetup() {
  if (process.env.E2E_LIVE_PDV === '1') {
    return async () => undefined;
  }

  if (EXTERNAL_SERVER) {
    await assertExternalServer()
    return async () => undefined
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
