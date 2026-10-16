import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { apiMiddleware } from './server/api.ts';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'ttd-api-server',
      configureServer(server) {
        server.middlewares.use(apiMiddleware());
      },
      configurePreviewServer(server) {
        server.middlewares.use(apiMiddleware());
      },
    },
  ],
  server: {
    host: true,
  },
});
