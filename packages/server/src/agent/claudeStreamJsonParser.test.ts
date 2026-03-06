import { describe, it, expect, beforeEach } from 'vitest';
import {
  ClaudeStreamJsonParser,
  formatStreamFragmentForDisplay,
  type ParsedStreamFragment,
} from './claudeStreamJsonParser.js';

describe('ClaudeStreamJsonParser', () => {
  let parser: ClaudeStreamJsonParser;

  beforeEach(() => {
    parser = new ClaudeStreamJsonParser();
  });

  describe('processChunk — formato reale Claude Code CLI stream-json', () => {
    it('estrae testo dall\'evento assistant con blocco text', () => {
      const jsonLine = JSON.stringify({
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Hello world' }],
        },
        session_id: 'test-session',
      });

      const fragments = parser.processChunk(jsonLine + '\n');

      expect(fragments).toEqual([
        { type: 'text', content: 'Hello world' },
      ]);
    });

    it('estrae thinking dall\'evento assistant con blocco thinking', () => {
      const jsonLine = JSON.stringify({
        type: 'assistant',
        message: {
          content: [{ type: 'thinking', thinking: 'Let me analyze the problem...' }],
        },
      });

      const fragments = parser.processChunk(jsonLine + '\n');

      expect(fragments).toEqual([
        { type: 'thinking', content: 'Let me analyze the problem...' },
      ]);
    });

    it('estrae sia thinking che text dallo stesso evento assistant', () => {
      const jsonLine = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'thinking', thinking: 'Penso...' },
            { type: 'text', text: 'Ecco la risposta' },
          ],
        },
      });

      const fragments = parser.processChunk(jsonLine + '\n');

      expect(fragments).toEqual([
        { type: 'thinking', content: 'Penso...' },
        { type: 'text', content: 'Ecco la risposta' },
      ]);
    });

    it('ignora blocchi tool_use nell\'evento assistant', () => {
      const jsonLine = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Leggo il file' },
            { type: 'tool_use', id: 'tu_1', name: 'Read', input: { file_path: '/tmp/test.ts' } },
          ],
        },
      });

      const fragments = parser.processChunk(jsonLine + '\n');

      expect(fragments).toEqual([
        { type: 'text', content: 'Leggo il file' },
      ]);
    });

    it('ignora blocchi text vuoti', () => {
      const jsonLine = JSON.stringify({
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: '' }],
        },
      });

      const fragments = parser.processChunk(jsonLine + '\n');
      expect(fragments).toEqual([]);
    });

    it('ignora eventi result', () => {
      const jsonLine = JSON.stringify({
        type: 'result',
        subtype: 'success',
        result: 'Final answer here',
        cost_usd: 0.05,
      });

      const fragments = parser.processChunk(jsonLine + '\n');
      expect(fragments).toEqual([]);
    });

    it('ignora eventi system', () => {
      const jsonLine = JSON.stringify({
        type: 'system',
        subtype: 'init',
        cwd: '/tmp',
        tools: ['Read', 'Edit'],
      });

      const fragments = parser.processChunk(jsonLine + '\n');
      expect(fragments).toEqual([]);
    });

    it('ignora eventi rate_limit_event', () => {
      const jsonLine = JSON.stringify({
        type: 'rate_limit_event',
        rate_limit_info: { status: 'allowed' },
      });

      const fragments = parser.processChunk(jsonLine + '\n');
      expect(fragments).toEqual([]);
    });

    it('gestisce evento assistant senza campo content', () => {
      const jsonLine = JSON.stringify({
        type: 'assistant',
        message: { model: 'claude-opus-4-6' },
      });

      const fragments = parser.processChunk(jsonLine + '\n');
      expect(fragments).toEqual([]);
    });

    it('gestisce evento assistant con message mancante', () => {
      const jsonLine = JSON.stringify({
        type: 'assistant',
      });

      const fragments = parser.processChunk(jsonLine + '\n');
      expect(fragments).toEqual([]);
    });
  });

  describe('processChunk — output plain text (non-JSON)', () => {
    it('passa righe non-JSON come frammenti raw', () => {
      const fragments = parser.processChunk('Building project...\n');

      expect(fragments).toEqual([
        { type: 'raw', content: 'Building project...' },
      ]);
    });

    it('gestisce piu righe plain text in un singolo chunk', () => {
      const fragments = parser.processChunk('Line 1\nLine 2\nLine 3\n');

      expect(fragments).toEqual([
        { type: 'raw', content: 'Line 1' },
        { type: 'raw', content: 'Line 2' },
        { type: 'raw', content: 'Line 3' },
      ]);
    });

    it('ignora righe vuote', () => {
      const fragments = parser.processChunk('Hello\n\n\nWorld\n');

      expect(fragments).toEqual([
        { type: 'raw', content: 'Hello' },
        { type: 'raw', content: 'World' },
      ]);
    });
  });

  describe('processChunk — gestione buffer e chunk parziali', () => {
    it('conserva righe incomplete nel buffer', () => {
      const fragments1 = parser.processChunk('{"type":"assis');
      expect(fragments1).toEqual([]);

      const fragments2 = parser.processChunk(
        'tant","message":{"content":[{"type":"text","text":"Hi"}]}}\n',
      );
      expect(fragments2).toEqual([
        { type: 'text', content: 'Hi' },
      ]);
    });

    it('gestisce un chunk con una riga completa e una parziale', () => {
      const completeLine = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'First' }] },
      });
      const partialLine = '{"type":"assis';

      const fragments1 = parser.processChunk(completeLine + '\n' + partialLine);
      expect(fragments1).toEqual([
        { type: 'text', content: 'First' },
      ]);

      const fragments2 = parser.processChunk(
        'tant","message":{"content":[{"type":"text","text":"Second"}]}}\n',
      );
      expect(fragments2).toEqual([
        { type: 'text', content: 'Second' },
      ]);
    });

    it('gestisce chunk con piu eventi JSON completi', () => {
      const line1 = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'thinking', thinking: 'Hmm...' }] },
      });
      const line2 = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Answer' }] },
      });

      const fragments = parser.processChunk(line1 + '\n' + line2 + '\n');

      expect(fragments).toEqual([
        { type: 'thinking', content: 'Hmm...' },
        { type: 'text', content: 'Answer' },
      ]);
    });
  });

  describe('flush — svuotamento buffer finale', () => {
    it('restituisce il contenuto residuo del buffer', () => {
      parser.processChunk('Last line without newline');

      const fragments = parser.flush();

      expect(fragments).toEqual([
        { type: 'raw', content: 'Last line without newline' },
      ]);
    });

    it('restituisce array vuoto se il buffer e vuoto', () => {
      const fragments = parser.flush();
      expect(fragments).toEqual([]);
    });

    it('parsa JSON residuo nel buffer', () => {
      const jsonLine = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Final' }] },
      });
      parser.processChunk(jsonLine); // senza newline

      const fragments = parser.flush();

      expect(fragments).toEqual([
        { type: 'text', content: 'Final' },
      ]);
    });

    it('svuota il buffer dopo flush', () => {
      parser.processChunk('residuo');
      parser.flush();

      const fragments = parser.flush();
      expect(fragments).toEqual([]);
    });
  });

  describe('output misto JSON e plain text', () => {
    it('gestisce un flusso misto di righe JSON e plain text', () => {
      const jsonLine = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Generated code' }] },
      });

      const mixedOutput = `Starting agent...\n${jsonLine}\nDone.\n`;
      const fragments = parser.processChunk(mixedOutput);

      expect(fragments).toEqual([
        { type: 'raw', content: 'Starting agent...' },
        { type: 'text', content: 'Generated code' },
        { type: 'raw', content: 'Done.' },
      ]);
    });
  });

  describe('scenario reale Claude Code multi-turn', () => {
    it('estrae testo da una sequenza realistica di eventi Claude Code', () => {
      const systemEvent = JSON.stringify({
        type: 'system',
        subtype: 'init',
        cwd: '/home/user/project',
        tools: ['Read', 'Edit', 'Bash'],
        model: 'claude-opus-4-6',
      });
      const assistantEvent = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'thinking', thinking: 'Devo leggere il file prima' },
            { type: 'text', text: 'Leggo il file per capire la struttura.' },
            { type: 'tool_use', id: 'tu_1', name: 'Read', input: { file_path: 'src/index.ts' } },
          ],
        },
        session_id: 'session-123',
      });
      const rateLimitEvent = JSON.stringify({
        type: 'rate_limit_event',
        rate_limit_info: { status: 'allowed' },
      });
      const resultEvent = JSON.stringify({
        type: 'result',
        subtype: 'success',
        result: 'Leggo il file per capire la struttura.',
        cost_usd: 0.05,
      });

      const fullStream = [systemEvent, assistantEvent, rateLimitEvent, resultEvent]
        .map(line => line + '\n')
        .join('');

      const fragments = parser.processChunk(fullStream);

      expect(fragments).toEqual([
        { type: 'thinking', content: 'Devo leggere il file prima' },
        { type: 'text', content: 'Leggo il file per capire la struttura.' },
      ]);
    });
  });
});

describe('formatStreamFragmentForDisplay', () => {
  it('formatta frammenti text senza newline aggiuntivo', () => {
    const fragment: ParsedStreamFragment = { type: 'text', content: 'Hello' };
    expect(formatStreamFragmentForDisplay(fragment)).toBe('Hello');
  });

  it('formatta frammenti thinking senza newline aggiuntivo', () => {
    const fragment: ParsedStreamFragment = { type: 'thinking', content: 'Let me think...' };
    expect(formatStreamFragmentForDisplay(fragment)).toBe('Let me think...');
  });

  it('formatta frammenti raw con newline finale', () => {
    const fragment: ParsedStreamFragment = { type: 'raw', content: 'Plain output' };
    expect(formatStreamFragmentForDisplay(fragment)).toBe('Plain output\n');
  });
});
