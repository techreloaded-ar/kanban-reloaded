interface ConnectionStatusIndicatorProps {
  connectionLost: boolean;
}

/**
 * Banner that appears at the top of the main content area when the
 * WebSocket connection to the server is lost. Disappears automatically
 * when the connection is restored.
 */
export function ConnectionStatusIndicator({ connectionLost }: ConnectionStatusIndicatorProps) {
  if (!connectionLost) {
    return null;
  }

  return (
    <div
      role="alert"
      className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
        <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
      <span>Connessione persa — riconnessione in corso...</span>
    </div>
  );
}
