import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// 3D probe: served under /3d/, reuses the 2D client's transport and touch controls through @client.
export default defineConfig({
  base: '/3d/',
  resolve: {
    alias: { '@client': fileURLToPath(new URL('../client/src', import.meta.url)) },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
  },
  // Reachable from a phone on the same Wi-Fi (http://<this PC's LAN address>:5175/3d/).
  server: { port: 5175, host: true },
  preview: { port: 4175, host: true },
});
