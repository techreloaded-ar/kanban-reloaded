import { useEffect, useRef, useState, useCallback } from 'react';

export interface WebSocketTaskEvent {
  type: 'task:created' | 'task:updated' | 'task:deleted' | 'task:reordered';
  payload: unknown;
  timestamp?: string;
}

interface UseWebSocketOptions {
  onTaskEvent: (event: WebSocketTaskEvent) => void;
  onReconnect: () => void;
}

interface UseWebSocketResult {
  isConnected: boolean;
  connectionLost: boolean;
}

function buildWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

function isValidTaskEventType(type: string): type is WebSocketTaskEvent['type'] {
  return (
    type === 'task:created' ||
    type === 'task:updated' ||
    type === 'task:deleted' ||
    type === 'task:reordered'
  );
}

/**
 * Custom hook for WebSocket connection to the Kanban Reloaded server.
 * Provides real-time task event updates and automatic reconnection.
 */
export function useWebSocket(options: UseWebSocketOptions): UseWebSocketResult {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasConnectedOnceRef = useRef(false);

  // Use refs for callbacks to avoid re-creating the WebSocket on every render
  const onTaskEventRef = useRef(options.onTaskEvent);
  onTaskEventRef.current = options.onTaskEvent;

  const onReconnectRef = useRef(options.onReconnect);
  onReconnectRef.current = options.onReconnect;

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    // Cancel any pending reconnect before opening a new connection
    clearReconnectTimer();

    // Clean up any existing connection
    if (socketRef.current !== null) {
      socketRef.current.close();
      socketRef.current = null;
    }

    const websocketUrl = buildWebSocketUrl();
    const socket = new WebSocket(websocketUrl);
    socketRef.current = socket;

    socket.addEventListener('open', () => {
      setIsConnected(true);
      clearReconnectTimer();

      if (hasConnectedOnceRef.current) {
        // This is a reconnection — sync state
        setConnectionLost(false);
        onReconnectRef.current();
      }

      hasConnectedOnceRef.current = true;
    });

    socket.addEventListener('message', (messageEvent: MessageEvent<unknown>) => {
      try {
        const rawData = messageEvent.data;
        if (typeof rawData !== 'string') return;

        const parsed: unknown = JSON.parse(rawData);
        if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) return;

        const parsedRecord = parsed as Record<string, unknown>;
        const eventType = parsedRecord.type;

        if (typeof eventType === 'string' && isValidTaskEventType(eventType)) {
          const taskEvent: WebSocketTaskEvent = {
            type: eventType,
            payload: parsedRecord.payload,
            timestamp: typeof parsedRecord.timestamp === 'string'
              ? parsedRecord.timestamp
              : undefined,
          };
          onTaskEventRef.current(taskEvent);
        }
      } catch {
        // Ignore malformed messages silently
      }
    });

    socket.addEventListener('close', () => {
      setIsConnected(false);

      if (hasConnectedOnceRef.current) {
        setConnectionLost(true);
      }

      // Schedule reconnection attempt
      clearReconnectTimer();
      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, 5000);
    });

    socket.addEventListener('error', () => {
      // The 'close' event will fire after 'error', which handles reconnection
    });
  }, [clearReconnectTimer]);

  useEffect(() => {
    connect();

    return () => {
      clearReconnectTimer();
      if (socketRef.current !== null) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [connect, clearReconnectTimer]);

  return { isConnected, connectionLost };
}
