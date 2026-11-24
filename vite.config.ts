import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = `http://localhost:${process.env.PORT ?? 3000}`;

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  // The --ssr pass bundles the API for Vercel; it needs no copy of public/.
  build: { copyPublicDir: !isSsrBuild },
  server: {
    host: true,
    allowedHosts: ['min-voice.codeinsane.dev'],
    proxy: {
      '/api': target,
    },
  },
}));
