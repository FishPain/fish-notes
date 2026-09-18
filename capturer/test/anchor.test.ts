import { describe, it, expect } from 'vitest';
import { buildTextFragment } from '../src/anchor.js';

describe('buildTextFragment', () => {
  it('encodes a short selection whole', () => {
    expect(buildTextFragment('the exact sentence')).toBe('#:~:text=the%20exact%20sentence');
  });
  it('uses start,end form for long selections', () => {
    const long = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
    const frag = buildTextFragment(long);
    expect(frag.startsWith('#:~:text=')).toBe(true);
    expect(frag).toContain(',');
    expect(frag).toContain('w0');
    expect(frag).toContain('w29');
  });
  it('returns empty string for blank input', () => {
    expect(buildTextFragment('   ')).toBe('');
  });
});
