import { extractSelection } from './dom-context.js';
import { buildTextFragment } from './anchor.js';
import { buildPayload } from './payload.js';

const toast = (text: string): void => {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText =
    'position:fixed;bottom:20px;right:20px;z-index:2147483647;background:#222;color:#fff;' +
    'padding:8px 12px;border-radius:6px;font:14px system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3)';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
};

// Send the built payload to the background queue and toast the outcome.
const save = (content: string, contextText: string, note: string): void => {
  const payload = buildPayload({
    content,
    contextText,
    url: location.href,
    anchor: buildTextFragment(content),
    note
  });
  chrome.runtime.sendMessage({ type: 'capture', payload }, (res) => {
    toast(res?.queued ? 'Queued — engine offline' : 'Saved');
  });
};

// Tiny inline note prompt anchored to the selection. Enter saves with the note,
// Esc saves with an empty note, clicking away cancels.
const promptNote = (content: string, contextText: string): void => {
  const sel = window.getSelection();
  const rect = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).getBoundingClientRect() : null;

  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;z-index:2147483647;background:#fff;border:1px solid #ccc;border-radius:6px;' +
    'padding:6px;box-shadow:0 2px 8px rgba(0,0,0,.2);' +
    'top:' + ((rect ? rect.bottom + window.scrollY : 60) + 4) + 'px;' +
    'left:' + (rect ? rect.left + window.scrollX : 60) + 'px';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Note (optional) — Enter to save';
  input.style.cssText = 'width:240px;padding:4px;font:14px system-ui,sans-serif;border:1px solid #ddd';
  box.appendChild(input);

  let done = false;
  const close = (): void => {
    done = true;
    document.removeEventListener('mousedown', onAway, true);
    box.remove();
  };
  const commit = (note: string): void => {
    if (done) return;
    close();
    save(content, contextText, note);
  };
  const onAway = (e: MouseEvent): void => {
    if (!box.contains(e.target as Node)) close();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit(input.value.trim());
    else if (e.key === 'Escape') commit('');
  });
  document.addEventListener('mousedown', onAway, true);

  document.body.appendChild(box);
  input.focus();
};

declare global {
  interface Window {
    __canvasNotesInjected?: boolean;
  }
}

// The content script can be injected twice (manifest content_scripts + the
// background's executeScript fallback). Register the listener only once, or
// duplicate listeners fire and the capture flow breaks on repeat use.
if (!window.__canvasNotesInjected) {
  window.__canvasNotesInjected = true;
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== 'do-capture') return;
    const { content, contextText } = extractSelection(window.getSelection());
    if (!content) {
      toast('Select some text first');
      return;
    }
    promptNote(content, contextText);
  });
}
