import { describe, it, expect } from 'vitest';
import { extractSelection } from '../src/dom-context.js';

describe('extractSelection', () => {
  it('returns selected text and the enclosing block as context', () => {
    const p = document.createElement('p');
    p.textContent = 'First sentence. Target sentence here. Third sentence.';
    const article = document.createElement('article');
    article.appendChild(p);
    document.body.replaceChildren(article);

    const textNode = p.firstChild as Text;
    const full = textNode.textContent as string;
    const startIdx = full.indexOf('Target');
    const range = document.createRange();
    range.setStart(textNode, startIdx);
    range.setEnd(textNode, startIdx + 'Target sentence here.'.length);

    const sel = window.getSelection() as Selection;
    sel.removeAllRanges();
    sel.addRange(range);

    const result = extractSelection(sel);
    expect(result.content).toBe('Target sentence here.');
    expect(result.contextText).toContain('First sentence');
    expect(result.contextText).toContain('Third sentence');
  });
  it('returns empty content when nothing is selected', () => {
    const sel = window.getSelection() as Selection;
    sel.removeAllRanges();
    expect(extractSelection(sel).content).toBe('');
  });
});
