import type { FastifyInstance } from 'fastify';
import type { WebSocketBroadcaster } from './websocketBroadcaster.js';

/**
 * Registra la route WebSocket sul server Fastify.
 *
 * La route `/ws` accetta connessioni WebSocket e le registra nel broadcaster.
 * I messaggi ricevuti dal client vengono ignorati (comunicazione server -> client only).
 */
export function registerWebSocketRoute(
  server: FastifyInstance,
  websocketBroadcaster: WebSocketBroadcaster,
): void {
  server.get('/ws', { websocket: true }, (socket, _request) => {
    websocketBroadcaster.addClient(socket, {
      info: (message: string) => server.log.info(message),
    });

    server.log.info(
      `WebSocket client connesso. Client attivi: ${websocketBroadcaster.getConnectedClientCount()}`,
    );
  });
}
