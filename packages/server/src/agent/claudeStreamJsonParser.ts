/**
 * Parser per l'output in formato `--output-format stream-json` di Claude Code CLI.
 *
 * Claude Code emette NDJSON (Newline-Delimited JSON): ogni riga e un oggetto JSON
 * indipendente. Il formato reale (verificato con Claude Code 2.1.x) comprende:
 *
 * - `{"type":"system",...}` — evento di inizializzazione (ignorato)
 * - `{"type":"assistant","message":{"content":[{"type":"text","text":"..."},{"type":"thinking","thinking":"..."}]}}` — risposta dell'assistente con contenuto testuale e/o ragionamento
 * - `{"type":"result","result":"...testo finale...","subtype":"success|error"}` — risultato finale con il testo completo
 *
 * In task multi-turn (con tool use), l'evento `assistant` viene emesso per ogni turno.
 * Il campo `message.content` e un array che puo contenere blocchi di tipo:
 * - `text`: testo di risposta generato dall'assistente
 * - `thinking`: ragionamento interno (extended thinking)
 * - `tool_use`: chiamata a un tool (ignorato — troppo rumoroso)
 *
 * Il parser gestisce trasparentemente anche output non-JSON (plain text):
 * le righe che non sono JSON valido vengono passate cosi come sono.
 * Questo permette di usare lo stesso pipeline per qualsiasi tipo di agent,
 * indipendentemente dal formato di output.
 */

/**
 * Tipo di frammento estratto dal flusso stream-json.
 *
 * - `thinking`: ragionamento interno dell'assistente (extended thinking)
 * - `text`: testo di risposta generato dall'assistente
 * - `raw`: riga non-JSON passata cosi com'e (plain text output)
 */
export type StreamFragmentType = 'thinking' | 'text' | 'raw';

/**
 * Un frammento di contenuto estratto da una riga del flusso stream-json.
 */
export interface ParsedStreamFragment {
  type: StreamFragmentType;
  content: string;
}

/**
 * Parser con stato che accumula i dati in arrivo, li divide in righe
 * complete e le analizza per estrarre frammenti di contenuto leggibili.
 *
 * Gestisce correttamente i chunk parziali: se un chunk taglia una riga
 * a meta, il residuo viene conservato nel buffer interno fino all'arrivo
 * del newline successivo.
 */
export class ClaudeStreamJsonParser {
  private lineBuffer = '';

  /**
   * Processa un chunk grezzo da stdout/stderr e restituisce
   * i frammenti di contenuto leggibile estratti.
   *
   * Ogni chunk puo contenere zero, una o piu righe complete.
   * Le righe incomplete restano nel buffer interno.
   */
  processChunk(rawChunk: string): ParsedStreamFragment[] {
    this.lineBuffer += rawChunk;
    const fragments: ParsedStreamFragment[] = [];

    const lines = this.lineBuffer.split('\n');
    // L'ultimo elemento potrebbe essere una riga incompleta — lo conserviamo nel buffer
    this.lineBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.length === 0) continue;

      const lineFragments = this.parseSingleLine(trimmedLine);
      for (const fragment of lineFragments) {
        fragments.push(fragment);
      }
    }

    return fragments;
  }

  /**
   * Svuota il buffer interno e restituisce eventuali frammenti residui.
   * Da chiamare quando il processo figlio termina per non perdere
   * l'ultima riga (senza newline finale).
   */
  flush(): ParsedStreamFragment[] {
    const remainingContent = this.lineBuffer.trim();
    this.lineBuffer = '';

    if (remainingContent.length === 0) return [];

    return this.parseSingleLine(remainingContent);
  }

  /**
   * Analizza una singola riga completa e restituisce zero o piu frammenti.
   *
   * Un evento `assistant` puo contenere piu blocchi di contenuto (text + thinking),
   * quindi una singola riga JSON puo produrre piu frammenti.
   */
  private parseSingleLine(line: string): ParsedStreamFragment[] {
    // Ottimizzazione: se non inizia con '{', non e JSON
    if (!line.startsWith('{')) {
      return [{ type: 'raw', content: line }];
    }

    try {
      const parsedEvent = JSON.parse(line) as Record<string, unknown>;
      return this.extractFragmentsFromEvent(parsedEvent);
    } catch {
      // JSON malformato — passa come testo grezzo
      return [{ type: 'raw', content: line }];
    }
  }

  /**
   * Estrae frammenti leggibili da un evento JSON parsato.
   *
   * Formato reale di Claude Code CLI (`--output-format stream-json --verbose`):
   *
   * ```json
   * {"type":"system","subtype":"init","cwd":"...","tools":[...]}
   * {"type":"assistant","message":{"content":[{"type":"text","text":"Hello"}]}}
   * {"type":"result","subtype":"success","result":"Hello","cost_usd":0.05}
   * ```
   */
  private extractFragmentsFromEvent(event: Record<string, unknown>): ParsedStreamFragment[] {
    // Evento assistant: contiene il contenuto della risposta in message.content[]
    if (event.type === 'assistant') {
      return this.extractFromAssistantEvent(event);
    }

    // L'evento `result` contiene il risultato finale — lo ignoriamo
    // perche il testo e gia stato estratto dall'evento `assistant`
    if (event.type === 'result') {
      return [];
    }

    // Eventi ignorati: system, rate_limit_event, content_block_start/stop,
    // content_block_delta (non emesso da Claude Code CLI, ma dalla API diretta),
    // message_start/delta/stop, ecc.
    return [];
  }

  /**
   * Estrae frammenti di testo e thinking dall'evento `assistant`.
   *
   * L'evento ha la struttura:
   * ```json
   * {
   *   "type": "assistant",
   *   "message": {
   *     "content": [
   *       {"type": "thinking", "thinking": "Let me analyze..."},
   *       {"type": "text", "text": "Here is the answer"},
   *       {"type": "tool_use", "name": "Read", "input": {...}}
   *     ]
   *   }
   * }
   * ```
   */
  private extractFromAssistantEvent(event: Record<string, unknown>): ParsedStreamFragment[] {
    const message = event.message;
    if (typeof message !== 'object' || message === null) return [];

    const messageRecord = message as Record<string, unknown>;
    const contentArray = messageRecord.content;
    if (!Array.isArray(contentArray)) return [];

    const fragments: ParsedStreamFragment[] = [];

    for (const contentBlock of contentArray) {
      if (typeof contentBlock !== 'object' || contentBlock === null) continue;
      const block = contentBlock as Record<string, unknown>;

      if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
        fragments.push({ type: 'text', content: block.text });
      }

      if (block.type === 'thinking' && typeof block.thinking === 'string' && block.thinking.length > 0) {
        fragments.push({ type: 'thinking', content: block.thinking });
      }

      // tool_use, tool_result e altri tipi vengono ignorati
    }

    return fragments;
  }
}

/**
 * Formatta un frammento parsato in testo leggibile per la visualizzazione.
 *
 * Il testo e il thinking vengono passati cosi come sono — la distinzione
 * visiva puo essere gestita dal frontend se necessario.
 * Le righe raw ricevono un newline finale per preservare la formattazione originale.
 */
export function formatStreamFragmentForDisplay(fragment: ParsedStreamFragment): string {
  switch (fragment.type) {
    case 'thinking':
      return fragment.content;
    case 'text':
      return fragment.content;
    case 'raw':
      return fragment.content + '\n';
  }
}
