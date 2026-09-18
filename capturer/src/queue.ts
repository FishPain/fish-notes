import { CapturePayload } from './types.js';

export interface QueueStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(obj: Record<string, unknown>): Promise<void>;
}

export type Sender = (payload: CapturePayload) => Promise<void>;

const KEY = 'queue';

export const makeQueue = (storage: QueueStorage, sender: Sender) => {
  const read = async (): Promise<CapturePayload[]> => {
    const got = await storage.get(KEY);
    return (got[KEY] as CapturePayload[]) ?? [];
  };
  const write = (items: CapturePayload[]) => storage.set({ [KEY]: items });

  // Try to send; on failure, persist to the queue so nothing is lost.
  const enqueue = async (payload: CapturePayload): Promise<void> => {
    try {
      await sender(payload);
    } catch {
      const items = await read();
      items.push(payload);
      await write(items);
    }
  };

  // Drain queued items oldest-first; stop at the first failure and keep the rest.
  const flush = async (): Promise<void> => {
    const items = await read();
    const remaining = [...items];
    while (remaining.length > 0) {
      try {
        await sender(remaining[0]);
        remaining.shift();
      } catch {
        break;
      }
    }
    await write(remaining);
  };

  return { enqueue, flush };
};
