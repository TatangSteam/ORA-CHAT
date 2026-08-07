import { createServer } from 'node:http';
import { apiPort } from '@raho/config';
import { createApp } from './app.js';

const server = createServer(createApp());

server.listen(apiPort, '0.0.0.0', () => {
  process.stdout.write(`RAHO API listening on port ${apiPort}\n`);
});

const shutdown = (signal: string) => {
  process.stdout.write(`RAHO API received ${signal}\n`);
  server.close((error) => {
    process.exitCode = error ? 1 : 0;
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
