import { describe, it, expect, vi } from 'vitest';
import { makeQueue } from '../src/queue.js';
import { CapturePayload } from '../src/types.js';

const payload = (content: string): CapturePayload => ({
  content,
  contextText: '',
  note: '',
  source: { type: 'web', url: 'https://e.com', anchor: '' },
  screenshot: null,
  tags: [],
  capturedAt: '2026-09-18T00:00:00.000Z'
});

const memStorage = () => {
  let data: Record<string, unknown> = {};
  return {
    async get(key: string) {
      return { [key]: data[key] };
    },
    async set(obj: Record<string, unknown>) {
      data = { ...data, ...obj };
    },
    _dump: () => data
  };
};

describe('makeQueue', () => {
  it('sends immediately when the sender succeeds (nothing left queued)', async () => {
    const storage = memStorage();
    const sender = vi.fn().mockResolvedValue(undefined);
    const q = makeQueue(storage, sender);
    await q.enqueue(payload('a'));
    expect(sender).toHaveBeenCalledTimes(1);
    const stored = (await storage.get('queue')).queue as unknown[];
    expect(stored ?? []).toEqual([]);
  });

  it('persists on failure and flushes later when the sender recovers', async () => {
    const storage = memStorage();
    const sender = vi
      .fn()
      .mockRejectedValueOnce(new Error('engine down'))
      .mockResolvedValue(undefined);
    const q = makeQueue(storage, sender);

    await q.enqueue(payload('a'));
    let stored = (await storage.get('queue')).queue as unknown[];
    expect(stored).toHaveLength(1);

    await q.flush();
    stored = (await storage.get('queue')).queue as unknown[];
    expect(stored).toEqual([]);
    expect(sender).toHaveBeenCalledTimes(2);
  });
});
