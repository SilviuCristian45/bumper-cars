import { createServer } from './app';
import { HOST, PORT } from './config';

const server = createServer();
await server.listen(PORT, HOST);
console.log(`Mașinuțe de Bâlci: server pe http://${HOST}:${PORT}`);
