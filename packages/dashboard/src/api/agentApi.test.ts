import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAllAgents, createAgent, updateAgent, deleteAgent } from './agentApi.js';
import { createMockAgent, mockFetchSuccess, mockFetchError } from '../test-utils/mockHelpers.js';

// ─── Setup / Teardown ────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── getAllAgents ────────────────────────────────────────────

describe('getAllAgents', () => {
  it('calls GET /api/agents and returns the agent list', async () => {
    const mockAgents = [createMockAgent(), createMockAgent({ id: 'agent-2', name: 'Copilot' })];
    mockFetchSuccess(mockAgents);

    const result = await getAllAgents();

    expect(fetch).toHaveBeenCalledWith('/api/agents');
    expect(result).toEqual(mockAgents);
  });

  it('returns an empty array when no agents exist', async () => {
    mockFetchSuccess([]);

    const result = await getAllAgents();

    expect(result).toEqual([]);
  });

  it('throws when the server responds with 500', async () => {
    mockFetchError(500, 'Internal Server Error');

    await expect(getAllAgents()).rejects.toThrow('Errore nel caricamento degli agenti');
  });
});

// ─── createAgent ────────────────────────────────────────────

describe('createAgent', () => {
  it('sends POST /api/agents with the payload and returns the created agent', async () => {
    const payload = { name: 'New Agent', commandTemplate: 'agent run "$TASK"' };
    const createdAgent = createMockAgent(payload);
    mockFetchSuccess(createdAgent, 201);

    const result = await createAgent(payload);

    expect(fetch).toHaveBeenCalledWith('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(result.name).toBe('New Agent');
  });

  it('throws with the server error message on 400', async () => {
    mockFetchError(400, 'Nome obbligatorio');

    await expect(createAgent({ name: '', commandTemplate: '' })).rejects.toThrow('Nome obbligatorio');
  });
});

// ─── updateAgent ────────────────────────────────────────────

describe('updateAgent', () => {
  it('sends PATCH /api/agents/:id with the update payload and returns the updated agent', async () => {
    const updatedAgent = createMockAgent({ name: 'Renamed Agent' });
    mockFetchSuccess(updatedAgent);

    const result = await updateAgent('agent-aaaa-bbbb-cccc-dddd', { name: 'Renamed Agent' });

    expect(fetch).toHaveBeenCalledWith('/api/agents/agent-aaaa-bbbb-cccc-dddd', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed Agent' }),
    });
    expect(result.name).toBe('Renamed Agent');
  });

  it('throws with the server error message when the agent is not found (404)', async () => {
    mockFetchError(404, 'Agente non trovato');

    await expect(updateAgent('nonexistent', { name: 'X' })).rejects.toThrow('Agente non trovato');
  });

  it('throws with the server error message on conflict (409)', async () => {
    mockFetchError(409, 'Nome gia in uso');

    await expect(updateAgent('agent-id', { name: 'Duplicate' })).rejects.toThrow('Nome gia in uso');
  });
});

// ─── deleteAgent ────────────────────────────────────────────

describe('deleteAgent', () => {
  it('sends DELETE /api/agents/:id', async () => {
    mockFetchSuccess(null);

    await deleteAgent('agent-aaaa-bbbb-cccc-dddd');

    expect(fetch).toHaveBeenCalledWith('/api/agents/agent-aaaa-bbbb-cccc-dddd', {
      method: 'DELETE',
    });
  });

  it('throws with the server error message when the agent is not found (404)', async () => {
    mockFetchError(404, 'Agente non trovato');

    await expect(deleteAgent('nonexistent')).rejects.toThrow('Agente non trovato');
  });
});
