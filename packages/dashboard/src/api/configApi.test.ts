import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getConfiguration, updateConfiguration } from './configApi.js';
import { createMockConfiguration, mockFetchSuccess, mockFetchError } from '../test-utils/mockHelpers.js';

// ─── Setup / Teardown ────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── getConfiguration ───────────────────────────────────────

describe('getConfiguration', () => {
  it('calls GET /api/config and returns the project configuration', async () => {
    const mockConfig = createMockConfiguration();
    mockFetchSuccess(mockConfig);

    const result = await getConfiguration();

    expect(fetch).toHaveBeenCalledWith('/api/config');
    expect(result.serverPort).toBe(3000);
    expect(result.columns).toHaveLength(3);
  });

  it('throws when the server responds with 500', async () => {
    mockFetchError(500, 'Internal Server Error');

    await expect(getConfiguration()).rejects.toThrow('Errore nel caricamento della configurazione');
  });
});

// ─── updateConfiguration ────────────────────────────────────

describe('updateConfiguration', () => {
  it('sends PUT /api/config with partial fields and returns the full updated configuration', async () => {
    const updatedConfig = createMockConfiguration({ serverPort: 4000 });
    mockFetchSuccess(updatedConfig);

    const result = await updateConfiguration({ serverPort: 4000 });

    expect(fetch).toHaveBeenCalledWith('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverPort: 4000 }),
    });
    expect(result.serverPort).toBe(4000);
  });

  it('throws with the server error message on 400', async () => {
    mockFetchError(400, 'Porta non valida');

    await expect(updateConfiguration({ serverPort: -1 })).rejects.toThrow('Porta non valida');
  });

  it('throws with the server error message on 500', async () => {
    mockFetchError(500, 'Errore interno');

    await expect(updateConfiguration({ serverPort: 3000 })).rejects.toThrow('Errore interno');
  });
});
