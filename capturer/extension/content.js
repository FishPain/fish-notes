"use strict";
(() => {
  // src/dom-context.ts
  var extractSelection = (selection) => {
    if (!selection || selection.rangeCount === 0) {
      return { content: "", contextText: "" };
    }
    const range = selection.getRangeAt(0);
    const content = range.toString().trim();
    if (!content)
      return { content: "", contextText: "" };
    const container = range.commonAncestorContainer;
    const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
    const block = element?.closest("p, li, blockquote, article, section, main, div") ?? element;
    const contextText = (block?.textContent ?? content).trim().replace(/\s+/g, " ");
    return { content, contextText };
  };

  // src/anchor.ts
  var MAX_WHOLE_WORDS = 10;
  var buildTextFragment = (selection) => {
    const text = selection.trim().replace(/\s+/g, " ");
    if (!text)
      return "";
    const words = text.split(" ");
    if (words.length <= MAX_WHOLE_WORDS) {
      return `#:~:text=${encodeURIComponent(text)}`;
    }
    const start = words.slice(0, 4).join(" ");
    const end = words.slice(-4).join(" ");
    return `#:~:text=${encodeURIComponent(start)},${encodeURIComponent(end)}`;
  };

  // src/payload.ts
  var buildPayload = (parts) => ({
    content: parts.content,
    contextText: parts.contextText,
    note: parts.note ?? "",
    source: { type: "web", url: parts.url, anchor: parts.anchor },
    screenshot: parts.screenshot ?? null,
    tags: parts.tags ?? [],
    capturedAt: (/* @__PURE__ */ new Date()).toISOString()
  });

  // src/content-entry.ts
  var toast = (text) => {
    const el = document.createElement("div");
    el.textContent = text;
    el.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483647;background:#222;color:#fff;padding:8px 12px;border-radius:6px;font:14px system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3)";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2e3);
  };
  var save = (content, contextText, note) => {
    const payload = buildPayload({
      content,
      contextText,
      url: location.href,
      anchor: buildTextFragment(content),
      note
    });
    chrome.runtime.sendMessage({ type: "capture", payload }, (res) => {
      toast(res?.queued ? "Queued \u2014 engine offline" : "Saved");
    });
  };
  var promptNote = (content, contextText) => {
    const sel = window.getSelection();
    const rect = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).getBoundingClientRect() : null;
    const top = Math.min(rect ? rect.bottom + 4 : 60, window.innerHeight - 60);
    const left = Math.min(rect ? rect.left : 60, window.innerWidth - 280);
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;z-index:2147483647;background:#fff;border:1px solid #ccc;border-radius:6px;padding:6px;box-shadow:0 2px 8px rgba(0,0,0,.2);top:" + Math.max(8, top) + "px;left:" + Math.max(8, left) + "px";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Note (optional) \u2014 Enter to save";
    input.style.cssText = "width:240px;padding:4px;font:14px system-ui,sans-serif;border:1px solid #ddd";
    box.appendChild(input);
    let done = false;
    const close = () => {
      done = true;
      document.removeEventListener("mousedown", onAway, true);
      box.remove();
    };
    const commit = (note) => {
      if (done)
        return;
      close();
      save(content, contextText, note);
    };
    const onAway = (e) => {
      if (!box.contains(e.target))
        close();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter")
        commit(input.value.trim());
      else if (e.key === "Escape")
        commit("");
    });
    document.addEventListener("mousedown", onAway, true);
    document.body.appendChild(box);
    input.focus();
  };
  if (!window.__canvasNotesInjected) {
    window.__canvasNotesInjected = true;
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type !== "do-capture")
        return;
      const { content, contextText } = extractSelection(window.getSelection());
      if (!content) {
        toast("Select some text first");
        return;
      }
      promptNote(content, contextText);
    });
  }
})();
