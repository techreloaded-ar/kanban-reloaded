import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  WebSocketBroadcaster,
  type TaskWebSocketEventPayload,
} from './websocketBroadcaster.js';

/**
 * Crea un mock di WebSocket con readyState configurabile.
 * readyState 1 = OPEN (connessione attiva).
 */
function createMockWebSocket(readyState = 1) {
  return {
    readyState,
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
  };
}

/**
 * Crea un evento di test per il broadcast.
 */
function createTaskCreatedEvent(): TaskWebSocketEventPayload {
  return {
    type: 'task:created',
    payload: {
      id: 'test-id-001',
      displayId: 'TASK-001',
      title: 'Task di test',
      description: '',
      acceptanceCriteria: '',
      priority: 'medium',
      status: 'backlog',
      agentRunning: false,
      agentLog: null,
      agentId: null,
      agentName: null,
      createdAt: '2026-03-05T00:00:00.000Z',
      updatedAt: null,
      executionTime: null,
      position: 0,
    },
  };
}

describe('WebSocketBroadcaster', () => {
  let broadcaster: WebSocketBroadcaster;

  beforeEach(() => {
    broadcaster = new WebSocketBroadcaster();
  });

  describe('addClient', () => {
    it('incrementa il conteggio dei client connessi', () => {
      const mockSocket = createMockWebSocket();

      broadcaster.addClient(mockSocket as never);

      expect(broadcaster.getConnectedClientCount()).toBe(1);
    });

    it('registra i listener per close e error sul socket', () => {
      const mockSocket = createMockWebSocket();

      broadcaster.addClient(mockSocket as never);

      expect(mockSocket.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('permette di aggiungere piu client contemporaneamente', () => {
      const firstSocket = createMockWebSocket();
      const secondSocket = createMockWebSocket();
      const thirdSocket = createMockWebSocket();

      broadcaster.addClient(firstSocket as never);
      broadcaster.addClient(secondSocket as never);
      broadcaster.addClient(thirdSocket as never);

      expect(broadcaster.getConnectedClientCount()).toBe(3);
    });
  });

  describe('removeClient', () => {
    it('decrementa il conteggio dei client connessi', () => {
      const mockSocket = createMockWebSocket();
      broadcaster.addClient(mockSocket as never);

      broadcaster.removeClient(mockSocket as never);

      expect(broadcaster.getConnectedClientCount()).toBe(0);
    });

    it('non genera errori se si rimuove un client non presente', () => {
      const mockSocket = createMockWebSocket();

      expect(() => broadcaster.removeClient(mockSocket as never)).not.toThrow();
      expect(broadcaster.getConnectedClientCount()).toBe(0);
    });

    it('viene invocato automaticamente quando il client emette close', () => {
      const mockSocket = createMockWebSocket();
      broadcaster.addClient(mockSocket as never);

      // Simula l'evento close chiamando il callback registrato
      const closeCallback = mockSocket.on.mock.calls.find(
        (call) => call[0] === 'close',
      )?.[1] as (() => void) | undefined;

      expect(closeCallback).toBeDefined();
      closeCallback!();

      expect(broadcaster.getConnectedClientCount()).toBe(0);
    });

    it('viene invocato automaticamente quando il client emette error', () => {
      const mockSocket = createMockWebSocket();
      broadcaster.addClient(mockSocket as never);

      // Simula l'evento error chiamando il callback registrato
      const errorCallback = mockSocket.on.mock.calls.find(
        (call) => call[0] === 'error',
      )?.[1] as (() => void) | undefined;

      expect(errorCallback).toBeDefined();
      errorCallback!();

      expect(broadcaster.getConnectedClientCount()).toBe(0);
    });
  });

  describe('broadcastTaskEvent', () => {
    it('invia il messaggio serializzato a tutti i client con readyState OPEN', () => {
      const firstSocket = createMockWebSocket(1);
      const secondSocket = createMockWebSocket(1);
      broadcaster.addClient(firstSocket as never);
      broadcaster.addClient(secondSocket as never);

      broadcaster.broadcastTaskEvent(createTaskCreatedEvent());

      expect(firstSocket.send).toHaveBeenCalledOnce();
      expect(secondSocket.send).toHaveBeenCalledOnce();
    });

    it('non invia il messaggio a client con readyState diverso da OPEN', () => {
      const openSocket = createMockWebSocket(1); // OPEN
      const closingSocket = createMockWebSocket(2); // CLOSING
      const closedSocket = createMockWebSocket(3); // CLOSED
      broadcaster.addClient(openSocket as never);
      broadcaster.addClient(closingSocket as never);
      broadcaster.addClient(closedSocket as never);

      broadcaster.broadcastTaskEvent(createTaskCreatedEvent());

      expect(openSocket.send).toHaveBeenCalledOnce();
      expect(closingSocket.send).not.toHaveBeenCalled();
      expect(closedSocket.send).not.toHaveBeenCalled();
    });

    it('il messaggio contiene type, payload e timestamp in formato ISO', () => {
      const mockSocket = createMockWebSocket(1);
      broadcaster.addClient(mockSocket as never);

      const event = createTaskCreatedEvent();
      broadcaster.broadcastTaskEvent(event);

      const sentMessage = JSON.parse(
        mockSocket.send.mock.calls[0][0] as string,
      ) as Record<string, unknown>;

      expect(sentMessage.type).toBe('task:created');
      expect(sentMessage.payload).toEqual(event.payload);
      expect(typeof sentMessage.timestamp).toBe('string');
      // Verifica che il timestamp sia un ISO string valido
      expect(new Date(sentMessage.timestamp as string).toISOString()).toBe(
        sentMessage.timestamp,
      );
    });

    it('non genera errori quando non ci sono client connessi', () => {
      expect(() =>
        broadcaster.broadcastTaskEvent(createTaskCreatedEvent()),
      ).not.toThrow();
    });

    it('gestisce correttamente un evento task:deleted con payload {id}', () => {
      const mockSocket = createMockWebSocket(1);
      broadcaster.addClient(mockSocket as never);

      const deleteEvent: TaskWebSocketEventPayload = {
        type: 'task:deleted',
        payload: { id: 'task-to-delete' },
      };

      broadcaster.broadcastTaskEvent(deleteEvent);

      const sentMessage = JSON.parse(
        mockSocket.send.mock.calls[0][0] as string,
      ) as Record<string, unknown>;

      expect(sentMessage.type).toBe('task:deleted');
      expect(sentMessage.payload).toEqual({ id: 'task-to-delete' });
    });

    it('gestisce correttamente un evento task:reordered con array di task', () => {
      const mockSocket = createMockWebSocket(1);
      broadcaster.addClient(mockSocket as never);

      const reorderEvent: TaskWebSocketEventPayload = {
        type: 'task:reordered',
        payload: [
          {
            id: 'task-1',
            displayId: 'TASK-001',
            title: 'Primo',
            description: '',
            acceptanceCriteria: '',
            priority: 'high',
            status: 'backlog',
            agentRunning: false,
            agentLog: null,
            agentId: null,
      agentName: null,
            createdAt: '2026-03-05T00:00:00.000Z',
            updatedAt: null,
            executionTime: null,
            position: 0,
          },
          {
            id: 'task-2',
            displayId: 'TASK-002',
            title: 'Secondo',
            description: '',
            acceptanceCriteria: '',
            priority: 'low',
            status: 'backlog',
            agentRunning: false,
            agentLog: null,
            agentId: null,
      agentName: null,
            createdAt: '2026-03-05T00:00:00.000Z',
            updatedAt: null,
            executionTime: null,
            position: 1,
          },
        ],
      };

      broadcaster.broadcastTaskEvent(reorderEvent);

      const sentMessage = JSON.parse(
        mockSocket.send.mock.calls[0][0] as string,
      ) as Record<string, unknown>;

      expect(sentMessage.type).toBe('task:reordered');
      expect(Array.isArray(sentMessage.payload)).toBe(true);
      expect((sentMessage.payload as unknown[]).length).toBe(2);
    });

    it('invia lo stesso messaggio identico a tutti i client OPEN', () => {
      const firstSocket = createMockWebSocket(1);
      const secondSocket = createMockWebSocket(1);
      broadcaster.addClient(firstSocket as never);
      broadcaster.addClient(secondSocket as never);

      broadcaster.broadcastTaskEvent(createTaskCreatedEvent());

      const firstMessage = firstSocket.send.mock.calls[0][0] as string;
      const secondMessage = secondSocket.send.mock.calls[0][0] as string;
      expect(firstMessage).toBe(secondMessage);
    });
  });

  describe('getConnectedClientCount', () => {
    it('restituisce 0 quando non ci sono client connessi', () => {
      expect(broadcaster.getConnectedClientCount()).toBe(0);
    });

    it('riflette accuratamente il numero di client dopo aggiunte e rimozioni', () => {
      const firstSocket = createMockWebSocket();
      const secondSocket = createMockWebSocket();

      broadcaster.addClient(firstSocket as never);
      expect(broadcaster.getConnectedClientCount()).toBe(1);

      broadcaster.addClient(secondSocket as never);
      expect(broadcaster.getConnectedClientCount()).toBe(2);

      broadcaster.removeClient(firstSocket as never);
      expect(broadcaster.getConnectedClientCount()).toBe(1);

      broadcaster.removeClient(secondSocket as never);
      expect(broadcaster.getConnectedClientCount()).toBe(0);
    });

    it('non conta duplicati se lo stesso socket viene aggiunto due volte', () => {
      const mockSocket = createMockWebSocket();

      broadcaster.addClient(mockSocket as never);
      broadcaster.addClient(mockSocket as never);

      // Set previene duplicati, quindi il conteggio deve essere 1
      expect(broadcaster.getConnectedClientCount()).toBe(1);
    });
  });
});
