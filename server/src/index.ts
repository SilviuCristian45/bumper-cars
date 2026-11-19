import { createServer } from 'node:http';
import { TICK_RATE } from '@masinute/shared';

// Placeholder until stage 4 (Colyseus room). Loopback only, like production behind Caddy.
const PORT = Number(process.env.PORT ?? 2568);

createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, tickRate: TICK_RATE }));
    return;
  }
  res.writeHead(404).end();
}).listen(PORT, '127.0.0.1', () => console.log(`masinute server on 127.0.0.1:${PORT}`));
