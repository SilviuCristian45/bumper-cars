import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// 3D client: served under /3d/, reuses the 2D client's screens, networking and touch controls through @client.
export default defineConfig({
  base: '/3d/',
  // The 2D client's public files: the replaceable sounds (audio/), icons, manifest.
  publicDir: '../client/public',
  resolve: {
    alias: { '@client': fileURLToPath(new URL('../client/src', import.meta.url)) },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
  },
  // Reachable from a phone on the same Wi-Fi (http://<this PC's LAN address>:5175/3d/).
  server: {
    port: 5175,
    host: true,
    // Same game server and path as the 2D client (Caddy handle_path in production): 2D and 3D players share rooms.
    proxy: {
      '/colyseus': {
        target: 'http://127.0.0.1:2568',
        ws: true,
        rewrite: (path) => path.replace(/^\/colyseus/, ''),
      },
    },
  },
  // vite preview keeps the proxy above (preview.proxy defaults to server.proxy).
  preview: { port: 4175, host: true },
});
