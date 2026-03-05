import type { WebSocket } from 'ws';
import type { Task } from '@kanban-reloaded/core';

/** Costante WebSocket.OPEN (readyState === 1) per evitare magic numbers */
const WEBSOCKET_READY_STATE_OPEN = 1;

/**
 * Tipi di eventi WebSocket per la sincronizzazione real-time della board.
 */
export type TaskWebSocketEventType =
  | 'task:created'
  | 'task:updated'
  | 'task:deleted'
  | 'task:reordered';

/**
 * Payload specifico per ogni tipo di evento WebSocket.
 *
 * - task:created / task:updated: il task completo
 * - task:deleted: oggetto con l'id del task rimosso
 * - task:reordered: array di task riordinati
 */
export type TaskWebSocketEventPayload =
  | { type: 'task:created'; payload: Task }
  | { type: 'task:updated'; payload: Task }
  | { type: 'task:deleted'; payload: { id: string } }
  | { type: 'task:reordered'; payload: Task[] };

/**
 * Messaggio WebSocket completo inviato ai client connessi.
 * Estende il discriminated union con un timestamp ISO 8601.
 */
export type WebSocketBroadcastMessage = TaskWebSocketEventPayload & {
  timestamp: string;
};

/**
 * Gestisce l'insieme dei client WebSocket connessi e permette di inviare
 * eventi broadcast a tutti i client attivi.
 *
 * Pattern: singleton-like module — una singola istanza per server.
 */
export class WebSocketBroadcaster {
  private readonly connectedClients: Set<WebSocket> = new Set();

  /**
   * Aggiunge un client WebSocket alla lista dei client connessi.
   * Registra automaticamente i listener per la disconnessione e gli errori.
   * Il logger opzionale viene usato per loggare la disconnessione.
   */
  addClient(socket: WebSocket, logger?: { info: (message: string) => void }): void {
    this.connectedClients.add(socket);

    socket.on('close', () => {
      this.removeClient(socket);
      logger?.info(
        `WebSocket client disconnesso. Client attivi: ${this.getConnectedClientCount()}`,
      );
    });

    socket.on('error', () => {
      this.removeClient(socket);
    });
  }

  /**
   * Rimuove un client WebSocket dalla lista dei client connessi.
   */
  removeClient(socket: WebSocket): void {
    this.connectedClients.delete(socket);
  }

  /**
   * Invia un evento a tutti i client WebSocket connessi con readyState OPEN.
   * I client con connessione non attiva vengono ignorati silenziosamente.
   */
  broadcastTaskEvent(event: TaskWebSocketEventPayload): void {
    const message = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    const serializedMessage = JSON.stringify(message);

    for (const client of this.connectedClients) {
      if (client.readyState === WEBSOCKET_READY_STATE_OPEN) {
        client.send(serializedMessage);
      }
    }
  }

  /**
   * Restituisce il numero di client attualmente connessi.
   * Utile per logging e diagnostica.
   */
  getConnectedClientCount(): number {
    return this.connectedClients.size;
  }
}
