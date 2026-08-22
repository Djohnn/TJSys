import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: Number(new URL(process.env.BASE_URL ?? 'http://127.0.0.1:5199').port || 5199),
    proxy: {
      '/api': {
        target: process.env.E2E_API_BASE_URL?.replace(/\/api\/v1\/?$/, '') ?? process.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
  },
});
