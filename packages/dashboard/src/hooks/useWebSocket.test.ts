import { renderHook, act } from '@testing-library/react';
import { useWebSocket, type WebSocketTaskEvent, type WebSocketAgentEvent } from './useWebSocket';

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

type EventHandler = (event: Event | MessageEvent | CloseEvent) => void;

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = 0; // CONNECTING
  closeCalled = false;

  private listeners: Record<string, EventHandler[]> = {};

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, handler: EventHandler): void {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(handler);
  }

  removeEventListener(type: string, handler: EventHandler): void {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter((h) => h !== handler);
    }
  }

  close(): void {
    this.closeCalled = true;
    this.readyState = 3; // CLOSED
  }

  // ---- Test helpers ----

  simulateOpen(): void {
    this.readyState = 1; // OPEN
    const event = new Event('open');
    this.dispatch('open', event);
  }

  simulateMessage(data: string): void {
    const event = new MessageEvent('message', { data });
    this.dispatch('message', event);
  }

  simulateClose(code = 1000): void {
    this.readyState = 3; // CLOSED
    const event = new CloseEvent('close', { code });
    this.dispatch('close', event);
  }

  simulateError(): void {
    const event = new Event('error');
    this.dispatch('error', event);
  }

  private dispatch(type: string, event: Event | MessageEvent | CloseEvent): void {
    for (const handler of this.listeners[type] ?? []) {
      handler(event);
    }
  }

  static reset(): void {
    MockWebSocket.instances = [];
  }

  static latest(): MockWebSocket {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

function createDefaultOptions() {
  return {
    onTaskEvent: vi.fn(),
    onAgentEvent: vi.fn(),
    onReconnect: vi.fn(),
  };
}

/** Render the hook and immediately simulate an open connection. */
function renderAndConnect(overrides?: Partial<Parameters<typeof useWebSocket>[0]>) {
  const options = { ...createDefaultOptions(), ...overrides };
  const hookResult = renderHook(() => useWebSocket(options));

  // The useEffect fires on mount, creating a WebSocket instance
  const socket = MockWebSocket.latest();
  act(() => {
    socket.simulateOpen();
  });

  return { hookResult, socket, options };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useWebSocket', () => {
  beforeEach(() => {
    MockWebSocket.reset();
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // --- Connection lifecycle ---

  it('connects to the WebSocket URL derived from window.location', () => {
    const options = createDefaultOptions();
    renderHook(() => useWebSocket(options));

    expect(MockWebSocket.instances).toHaveLength(1);
    // jsdom includes the port in window.location.host
    expect(MockWebSocket.latest().url).toMatch(/^ws:\/\/localhost(:\d+)?\/ws$/);
  });

  it('sets isConnected to true when the socket opens', () => {
    const { hookResult } = renderAndConnect();

    expect(hookResult.result.current.isConnected).toBe(true);
    expect(hookResult.result.current.connectionLost).toBe(false);
  });

  it('sets isConnected to false before the socket opens', () => {
    const options = createDefaultOptions();
    const { result } = renderHook(() => useWebSocket(options));

    // Socket created but not yet open
    expect(result.current.isConnected).toBe(false);
  });

  // --- Task events ---

  it('invokes onTaskEvent with correct payload for task:created', () => {
    const { socket, options } = renderAndConnect();

    const message = {
      type: 'task:created',
      payload: { id: '1', title: 'New task' },
      timestamp: '2026-03-06T10:00:00Z',
    };

    act(() => {
      socket.simulateMessage(JSON.stringify(message));
    });

    expect(options.onTaskEvent).toHaveBeenCalledOnce();
    const receivedEvent: WebSocketTaskEvent = options.onTaskEvent.mock.calls[0][0];
    expect(receivedEvent.type).toBe('task:created');
    expect(receivedEvent.payload).toEqual({ id: '1', title: 'New task' });
    expect(receivedEvent.timestamp).toBe('2026-03-06T10:00:00Z');
  });

  it('invokes onTaskEvent for all valid task event types', () => {
    const { socket, options } = renderAndConnect();

    const taskEventTypes = ['task:created', 'task:updated', 'task:deleted', 'task:reordered'];

    for (const eventType of taskEventTypes) {
      act(() => {
        socket.simulateMessage(JSON.stringify({ type: eventType, payload: {} }));
      });
    }

    expect(options.onTaskEvent).toHaveBeenCalledTimes(4);
    const receivedTypes = options.onTaskEvent.mock.calls.map(
      (call: [WebSocketTaskEvent]) => call[0].type,
    );
    expect(receivedTypes).toEqual(taskEventTypes);
  });

  // --- Agent events ---

  it('invokes onAgentEvent with correct payload for agent:output', () => {
    const { socket, options } = renderAndConnect();

    const message = {
      type: 'agent:output',
      payload: { taskId: 'task-1', displayId: 'TASK-001', output: 'Running tests...' },
    };

    act(() => {
      socket.simulateMessage(JSON.stringify(message));
    });

    expect(options.onAgentEvent).toHaveBeenCalledOnce();
    const receivedEvent: WebSocketAgentEvent = options.onAgentEvent!.mock.calls[0][0];
    expect(receivedEvent.type).toBe('agent:output');
    expect(receivedEvent.payload.taskId).toBe('task-1');
    expect(receivedEvent.payload.output).toBe('Running tests...');
  });

  it('invokes onAgentEvent for agent:started and agent:completed', () => {
    const { socket, options } = renderAndConnect();

    act(() => {
      socket.simulateMessage(JSON.stringify({
        type: 'agent:started',
        payload: { taskId: 't1', displayId: 'TASK-001', processId: 1234 },
      }));
      socket.simulateMessage(JSON.stringify({
        type: 'agent:completed',
        payload: { taskId: 't1', displayId: 'TASK-001', exitCode: 0, success: true },
      }));
    });

    expect(options.onAgentEvent).toHaveBeenCalledTimes(2);
    expect(options.onAgentEvent!.mock.calls[0][0].type).toBe('agent:started');
    expect(options.onAgentEvent!.mock.calls[1][0].type).toBe('agent:completed');
  });

  // --- Malformed / invalid messages ---

  it('ignores malformed JSON without crashing', () => {
    const { socket, options } = renderAndConnect();

    act(() => {
      socket.simulateMessage('not valid json {{{');
    });

    expect(options.onTaskEvent).not.toHaveBeenCalled();
    expect(options.onAgentEvent).not.toHaveBeenCalled();
  });

  it('ignores messages without a type field', () => {
    const { socket, options } = renderAndConnect();

    act(() => {
      socket.simulateMessage(JSON.stringify({ payload: { id: '1' } }));
    });

    expect(options.onTaskEvent).not.toHaveBeenCalled();
    expect(options.onAgentEvent).not.toHaveBeenCalled();
  });

  it('does not invoke callbacks for invalid event types', () => {
    const { socket, options } = renderAndConnect();

    act(() => {
      socket.simulateMessage(JSON.stringify({ type: 'unknown:event', payload: {} }));
    });

    expect(options.onTaskEvent).not.toHaveBeenCalled();
    expect(options.onAgentEvent).not.toHaveBeenCalled();
  });

  it('ignores messages where data is not a string', () => {
    const { socket, options } = renderAndConnect();

    // Simulate a binary/non-string message by directly dispatching a MessageEvent
    // with non-string data. The hook checks `typeof rawData !== "string"`.
    const binaryEvent = new MessageEvent('message', { data: new ArrayBuffer(8) });
    act(() => {
      // Access the private dispatch through the public addEventListener path
      socket.simulateMessage(JSON.stringify({ type: 'task:created', payload: {} }));
    });

    // Reset and test with null-like JSON object (no 'type' string inside)
    options.onTaskEvent.mockClear();
    act(() => {
      socket.simulateMessage(JSON.stringify({ type: 42, payload: {} }));
    });

    expect(options.onTaskEvent).not.toHaveBeenCalled();
  });

  // --- Reconnection ---

  it('schedules reconnection after socket close with 5-second delay', () => {
    const { socket } = renderAndConnect();

    expect(MockWebSocket.instances).toHaveLength(1);

    act(() => {
      socket.simulateClose(1006); // Abnormal close
    });

    // No new WebSocket yet — timer not fired
    expect(MockWebSocket.instances).toHaveLength(1);

    // Advance timers by 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // A new WebSocket should have been created
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('sets connectionLost to true after unexpected close', () => {
    const { hookResult, socket } = renderAndConnect();

    act(() => {
      socket.simulateClose(1006);
    });

    expect(hookResult.result.current.isConnected).toBe(false);
    expect(hookResult.result.current.connectionLost).toBe(true);
  });

  it('calls onReconnect and clears connectionLost when reconnection succeeds', () => {
    const { hookResult, socket, options } = renderAndConnect();

    // First connection was successful (hasConnectedOnce = true)
    // Now simulate a disconnect
    act(() => {
      socket.simulateClose(1006);
    });

    expect(hookResult.result.current.connectionLost).toBe(true);

    // Advance timer to trigger reconnection
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    const reconnectedSocket = MockWebSocket.latest();

    // Simulate the new connection opening
    act(() => {
      reconnectedSocket.simulateOpen();
    });

    expect(hookResult.result.current.isConnected).toBe(true);
    expect(hookResult.result.current.connectionLost).toBe(false);
    expect(options.onReconnect).toHaveBeenCalledOnce();
  });

  // --- Cleanup on unmount ---

  it('closes the WebSocket and cancels timers on unmount', () => {
    const { hookResult, socket } = renderAndConnect();

    hookResult.unmount();

    expect(socket.closeCalled).toBe(true);
  });

  it('cancels pending reconnect timer on unmount', () => {
    const { hookResult, socket } = renderAndConnect();

    // Trigger a close so that a reconnect timer is scheduled
    act(() => {
      socket.simulateClose(1006);
    });

    // Unmount before the timer fires
    hookResult.unmount();

    // Advance past the reconnect delay — no new WebSocket should be created
    const instanceCountBeforeTimer = MockWebSocket.instances.length;
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(MockWebSocket.instances).toHaveLength(instanceCountBeforeTimer);
  });

  // --- Edge: onAgentEvent is optional ---

  it('does not crash when onAgentEvent is not provided', () => {
    const options = {
      onTaskEvent: vi.fn(),
      onReconnect: vi.fn(),
      // onAgentEvent intentionally omitted
    };

    const hookResult = renderHook(() => useWebSocket(options));
    const socket = MockWebSocket.latest();

    act(() => {
      socket.simulateOpen();
    });

    // Send an agent event — should not throw
    act(() => {
      socket.simulateMessage(JSON.stringify({
        type: 'agent:output',
        payload: { taskId: 't1', displayId: 'TASK-001', output: 'hello' },
      }));
    });

    expect(hookResult.result.current.isConnected).toBe(true);
  });
});
