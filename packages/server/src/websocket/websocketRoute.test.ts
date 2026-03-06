import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerWebSocketRoute } from './websocketRoute.js';
import type { WebSocketBroadcaster } from './websocketBroadcaster.js';
import type { FastifyInstance } from 'fastify';

/**
 * Crea un mock del WebSocketBroadcaster.
 */
function createMockBroadcaster(): WebSocketBroadcaster {
  return {
    addClient: vi.fn(),
    removeClient: vi.fn(),
    broadcastEvent: vi.fn(),
    broadcastTaskEvent: vi.fn(),
    getConnectedClientCount: vi.fn(() => 1),
  } as unknown as WebSocketBroadcaster;
}

/**
 * Crea un mock minimale di FastifyInstance che cattura la registrazione della route.
 * Permette di invocare il handler della route WebSocket per testare il suo comportamento.
 */
function createMockFastifyServer(): {
  server: FastifyInstance;
  getHandler: () => ((...args: unknown[]) => void) | null;
} {
  let capturedHandler: ((...args: unknown[]) => void) | null = null;

  const server = {
    get: vi.fn((_path: string, _options: unknown, handler: (...args: unknown[]) => void) => {
      capturedHandler = handler;
    }),
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
    },
  } as unknown as FastifyInstance;

  return { server, getHandler: () => capturedHandler };
}

describe('registerWebSocketRoute', () => {
  let mockBroadcaster: WebSocketBroadcaster;

  beforeEach(() => {
    mockBroadcaster = createMockBroadcaster();
  });

  it('registra una route GET su /ws con opzione websocket: true', () => {
    const { server } = createMockFastifyServer();

    registerWebSocketRoute(server, mockBroadcaster);

    expect(server.get).toHaveBeenCalledWith(
      '/ws',
      { websocket: true },
      expect.any(Function),
    );
  });

  it('aggiunge il client al broadcaster quando il handler viene invocato', () => {
    const { server, getHandler } = createMockFastifyServer();
    registerWebSocketRoute(server, mockBroadcaster);

    const handler = getHandler();
    expect(handler).not.toBeNull();

    // Simula una connessione WebSocket
    const mockSocket = { on: vi.fn(), send: vi.fn() };
    const mockRequest = {};
    handler!(mockSocket, mockRequest);

    expect(mockBroadcaster.addClient).toHaveBeenCalledWith(
      mockSocket,
      expect.objectContaining({
        info: expect.any(Function),
      }),
    );
  });

  it('logga il numero di client attivi quando un client si connette', () => {
    const { server, getHandler } = createMockFastifyServer();
    (mockBroadcaster.getConnectedClientCount as ReturnType<typeof vi.fn>).mockReturnValue(3);

    registerWebSocketRoute(server, mockBroadcaster);

    const handler = getHandler();
    const mockSocket = { on: vi.fn(), send: vi.fn() };
    handler!(mockSocket, {});

    expect(server.log.info).toHaveBeenCalledWith(
      expect.stringContaining('Client attivi: 3'),
    );
  });

  it('passa un logger che utilizza server.log.info per il broadcaster', () => {
    const { server, getHandler } = createMockFastifyServer();
    registerWebSocketRoute(server, mockBroadcaster);

    const handler = getHandler();
    const mockSocket = { on: vi.fn(), send: vi.fn() };
    handler!(mockSocket, {});

    // Estrai il logger passato ad addClient
    const addClientCall = (mockBroadcaster.addClient as ReturnType<typeof vi.fn>).mock.calls[0];
    const passedLogger = addClientCall[1] as { info: (message: string) => void };

    // Invoca il logger passato e verifica che usi server.log.info
    passedLogger.info('Test messaggio');
    expect(server.log.info).toHaveBeenCalledWith('Test messaggio');
  });

  it('gestisce connessioni multiple in sequenza', () => {
    const { server, getHandler } = createMockFastifyServer();
    registerWebSocketRoute(server, mockBroadcaster);

    const handler = getHandler();
    const firstSocket = { on: vi.fn(), send: vi.fn() };
    const secondSocket = { on: vi.fn(), send: vi.fn() };

    handler!(firstSocket, {});
    handler!(secondSocket, {});

    expect(mockBroadcaster.addClient).toHaveBeenCalledTimes(2);
    expect(mockBroadcaster.addClient).toHaveBeenCalledWith(firstSocket, expect.any(Object));
    expect(mockBroadcaster.addClient).toHaveBeenCalledWith(secondSocket, expect.any(Object));
  });
});
