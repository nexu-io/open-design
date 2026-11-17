import { once } from 'node:events';
import type { Response } from 'express';
import {
  MESSAGES_STREAM_CONTENT_TYPE,
  type ChatMessage,
  type MessagesStreamRecord,
} from '@open-design/contracts';

/** Serialize one message at a time, never the entire conversation as one string. */
export async function streamMessages(res: Response, messages: readonly ChatMessage[]): Promise<void> {
  const controller = new AbortController();
  const onClose = () => controller.abort();
  res.once('close', onClose);
  res.type(MESSAGES_STREAM_CONTENT_TYPE);
  res.setHeader('Cache-Control', 'no-store');
  try {
    let count = 0;
    for (const message of messages) {
      if (res.destroyed) return;
      const record: MessagesStreamRecord = { type: 'message', message };
      if (!res.write(`${JSON.stringify(record)}\n`)) {
        // A disconnected reader must also release a pending drain wait.
        await once(res, 'drain', { signal: controller.signal });
      }
      count += 1;
    }
    if (!res.destroyed) {
      const end: MessagesStreamRecord = { type: 'end', count };
      res.end(`${JSON.stringify(end)}\n`);
    }
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    res.off('close', onClose);
  }
}
