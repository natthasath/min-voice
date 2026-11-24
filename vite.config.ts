import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = `http://localhost:${process.env.PORT ?? 3000}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: ['min-voice.codeinsane.dev'],
    proxy: {
      '/api': target,
      '/socket.io': { target, ws: true },
    },
  },
});
