import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { config } from './config.js';
import { MatchRoom } from './rooms/MatchRoom.js';

const server = new Server({
  transport: new WebSocketTransport(),
});

server.define('match', MatchRoom);

await server.listen(config.port);
console.log(`Realms of Eternia server listening on ws://localhost:${config.port}`);
