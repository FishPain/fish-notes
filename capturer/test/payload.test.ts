import { describe, it, expect } from 'vitest';
import { buildPayload } from '../src/payload.js';

describe('buildPayload', () => {
  it('assembles a CapturePayload with a web source and ISO timestamp', () => {
    const p = buildPayload({
      content: 'the passage',
      contextText: 'the surrounding paragraph',
      note: 'my thought',
      url: 'https://ex.com/a',
      anchor: '#:~:text=the%20passage',
      screenshot: null,
      tags: ['x']
    });
    expect(p.source).toEqual({ type: 'web', url: 'https://ex.com/a', anchor: '#:~:text=the%20passage' });
    expect(p.content).toBe('the passage');
    expect(p.note).toBe('my thought');
    expect(p.tags).toEqual(['x']);
    expect(new Date(p.capturedAt).toString()).not.toBe('Invalid Date');
  });
  it('defaults optional fields', () => {
    const p = buildPayload({ content: 'x', contextText: '', url: 'https://e.com', anchor: '' });
    expect(p.note).toBe('');
    expect(p.screenshot).toBeNull();
    expect(p.tags).toEqual([]);
  });
});
