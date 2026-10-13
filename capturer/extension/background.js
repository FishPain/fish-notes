"use strict";
(() => {
  // src/queue.ts
  var KEY = "queue";
  var makeQueue = (storage, sender2) => {
    const read = async () => {
      const got = await storage.get(KEY);
      return got[KEY] ?? [];
    };
    const write = (items) => storage.set({ [KEY]: items });
    const enqueue = async (payload) => {
      try {
        await sender2(payload);
      } catch {
        const items = await read();
        items.push(payload);
        await write(items);
      }
    };
    const flush = async () => {
      const items = await read();
      const remaining = [...items];
      while (remaining.length > 0) {
        try {
          await sender2(remaining[0]);
          remaining.shift();
        } catch {
          break;
        }
      }
      await write(remaining);
    };
    return { enqueue, flush };
  };

  // src/constants.ts
  var DEFAULT_ENGINE = {
    baseUrl: "http://localhost:7645",
    token: ""
  };

  // src/background-entry.ts
  var sender = async (payload) => {
    const cfg = await chrome.storage.local.get(["baseUrl", "token"]);
    const baseUrl = cfg.baseUrl ?? DEFAULT_ENGINE.baseUrl;
    const token = cfg.token ?? DEFAULT_ENGINE.token;
    const res = await fetch(baseUrl + "/capture", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + token },
      body: JSON.stringify(payload)
    });
    if (!res.ok)
      throw new Error("engine responded " + res.status);
  };
  var queue = makeQueue(chrome.storage.local, sender);
  var sendDoCapture = async (tabId) => {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "do-capture" });
    } catch {
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
        await chrome.tabs.sendMessage(tabId, { type: "do-capture" });
      } catch {
        console.warn("Canvas Notes: cannot capture on this page (restricted page like chrome://, PDF, or the Web Store).");
      }
    }
  };
  var triggerCapture = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id)
      await sendDoCapture(tab.id);
  };
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: "capture-selection",
      title: "Capture selection to Canvas Notes",
      contexts: ["selection"]
    });
    chrome.alarms.create("flush", { periodInMinutes: 1 });
  });
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "capture-selection" && tab?.id) {
      sendDoCapture(tab.id);
    }
  });
  chrome.commands.onCommand.addListener((command) => {
    if (command === "capture-selection")
      triggerCapture();
  });
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "capture")
      return;
    const key = "queue";
    (async () => {
      const before = ((await chrome.storage.local.get(key))[key] ?? []).length;
      await queue.enqueue(msg.payload);
      const after = ((await chrome.storage.local.get(key))[key] ?? []).length;
      sendResponse({ ok: true, queued: after > before });
    })();
    return true;
  });
  chrome.runtime.onStartup.addListener(() => {
    chrome.alarms.create("flush", { periodInMinutes: 1 });
    queue.flush();
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "flush")
      queue.flush();
  });
})();
