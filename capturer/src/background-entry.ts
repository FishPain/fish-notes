import { makeQueue } from './queue.js';
import { DEFAULT_ENGINE } from './constants.js';
import { CapturePayload } from './types.js';

const sender = async (payload: CapturePayload): Promise<void> => {
  const cfg = await chrome.storage.local.get(['baseUrl', 'token']);
  const baseUrl = (cfg.baseUrl as string) ?? DEFAULT_ENGINE.baseUrl;
  const token = (cfg.token as string) ?? DEFAULT_ENGINE.token;
  const res = await fetch(baseUrl + '/capture', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('engine responded ' + res.status);
};

const queue = makeQueue(chrome.storage.local, sender);

const sendDoCapture = async (tabId: number): Promise<void> => {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'do-capture' });
  } catch {
    // No content script in this tab (opened before the extension loaded, or the
    // extension was just reloaded). Inject it on demand, then retry once.
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      await chrome.tabs.sendMessage(tabId, { type: 'do-capture' });
    } catch {
      console.warn('Canvas Notes: cannot capture on this page (restricted page like chrome://, PDF, or the Web Store).');
    }
  }
};

const triggerCapture = async (): Promise<void> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) await sendDoCapture(tab.id);
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'capture-selection',
    title: 'Capture selection to Canvas Notes',
    contexts: ['selection']
  });
  chrome.alarms.create('flush', { periodInMinutes: 1 });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'capture-selection' && tab?.id) {
    sendDoCapture(tab.id);
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'capture-selection') triggerCapture();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'capture') return;
  // Queued vs sent: enqueue only grows the stored queue on send failure, so a
  // length bump tells the content script the engine was offline.
  const key = 'queue';
  (async () => {
    const before = (((await chrome.storage.local.get(key))[key] as unknown[]) ?? []).length;
    await queue.enqueue(msg.payload as CapturePayload);
    const after = (((await chrome.storage.local.get(key))[key] as unknown[]) ?? []).length;
    sendResponse({ ok: true, queued: after > before });
  })();
  return true;
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('flush', { periodInMinutes: 1 });
  queue.flush();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'flush') queue.flush();
});
