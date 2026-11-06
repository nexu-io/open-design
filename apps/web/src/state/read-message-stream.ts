import type { ChatMessage, MessagesStreamRecord } from '@open-design/contracts';

/** Only return an authoritative transcript after its explicit completion frame. */
export async function readMessageStream(
  response: Response,
  signal?: AbortSignal,
  onProgress?: () => void,
): Promise<ChatMessage[]> {
  signal?.throwIfAborted();
  if (!response.body) throw new Error('Missing transcript response body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const messages: ChatMessage[] = [];
  let fragments: string[] = [];
  let completed = false;
  let finished = false;

  function consume(text: string) {
    let start = 0;
    for (let end = text.indexOf('\n'); end !== -1; end = text.indexOf('\n', start)) {
      fragments.push(text.slice(start, end));
      const line = fragments.join('');
      fragments = [];
      start = end + 1;
      if (!line.trim()) continue;
      if (completed) throw new Error('Unexpected record after transcript completion');
      let record: MessagesStreamRecord;
      try {
        record = JSON.parse(line) as MessagesStreamRecord;
      } catch (cause) {
        throw new Error('Invalid transcript JSON', { cause });
      }
      if (record.type === 'message') {
        if (!record.message || typeof record.message.id !== 'string'
          || typeof record.message.content !== 'string') {
          throw new Error('Invalid transcript message');
        }
        messages.push(record.message);
      } else if (record.type === 'end' && record.count === messages.length) {
        completed = true;
      } else {
        throw new Error('Invalid transcript stream record');
      }
    }
    if (start < text.length) fragments.push(text.slice(start));
  }

  const onAbort = () => { void reader.cancel(signal?.reason).catch(() => {}); };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      // Renew on bytes, not complete lines: one large message may span many reads.
      if (value.byteLength > 0) onProgress?.();
      consume(decoder.decode(value, { stream: true }));
    }
    consume(decoder.decode());
    if (fragments.length > 0 || !completed) throw new Error('Incomplete transcript stream');
    finished = true;
    return messages;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    if (!finished) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
