/** Source of the code that runs before an extension inside its Web Worker.
 * It exposes the `stride` API (message-based RPC to the editor) and removes
 * network access unless the extension asked for the "network" permission. */
export function sandboxPrelude(permissions: string[]): string {
  return `"use strict";
(() => {
  const PERMS = ${JSON.stringify(permissions)};
  if (!PERMS.includes("network")) {
    // Remove network APIs from the global object and its whole prototype chain.
    for (const k of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "Worker", "SharedWorker", "WebTransport"]) {
      for (let o = self; o; o = Object.getPrototypeOf(o)) {
        try { Object.defineProperty(o, k, { value: undefined, writable: false, configurable: false }); } catch (e) {}
      }
    }
  }
  let seq = 0;
  const pending = new Map();
  const commands = new Map();
  const listeners = { save: [], activeEditor: [], textChange: [] };
  const call = (method, ...args) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    postMessage({ type: "call", id, method, args });
  });
  self.onmessage = async (e) => {
    const m = e.data;
    if (m.type === "result") {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (p) m.error ? p.reject(new Error(m.error)) : p.resolve(m.value);
    } else if (m.type === "command") {
      const handler = commands.get(m.command);
      try {
        if (!handler) throw new Error("The extension did not register a handler for " + m.command);
        await handler(...(m.args || []));
        postMessage({ type: "commandDone", id: m.id });
      } catch (err) {
        postMessage({ type: "commandDone", id: m.id, error: String((err && err.message) || err) });
      }
    } else if (m.type === "event") {
      for (const h of listeners[m.event] || []) {
        try { await h(m.payload); } catch (err) { console.error(err); }
      }
    }
  };
  const on = (name) => (handler) => { listeners[name].push(handler); };
  self.stride = Object.freeze({
    commands: Object.freeze({ register: (id, handler) => { commands.set(id, handler); } }),
    editor: Object.freeze({
      getText: () => call("editor.getText"),
      getSelectedText: () => call("editor.getSelectedText"),
      getLanguage: () => call("editor.getLanguage"),
      getFileName: () => call("editor.getFileName"),
      replaceSelection: (text) => call("editor.replaceSelection", String(text)),
      insertText: (text) => call("editor.insertText", String(text)),
      setText: (text) => call("editor.setText", String(text)),
    }),
    window: Object.freeze({
      showMessage: (text, kind = "info") => call("window.showMessage", String(text), kind),
      showQuickPick: (items, placeholder = "") => call("window.showQuickPick", items, String(placeholder)),
      showInput: (prompt, value = "") => call("window.showInput", String(prompt), String(value)),
    }),
    statusBar: Object.freeze({
      set: (text, tooltip = "") => call("statusBar.set", String(text), String(tooltip)),
      clear: () => call("statusBar.clear"),
    }),
    events: Object.freeze({
      onDidSave: on("save"),
      onDidChangeActiveEditor: on("activeEditor"),
      onDidChangeText: on("textChange"),
    }),
    storage: Object.freeze({
      get: (key) => call("storage.get", String(key)),
      set: (key, value) => call("storage.set", String(key), value),
    }),
    clipboard: Object.freeze({ writeText: (text) => call("clipboard.writeText", String(text)) }),
    ai: Object.freeze({ complete: (prompt, system = "") => call("ai.complete", String(prompt), String(system)) }),
  });
})();
`;
}
