const toB64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const fromB64 = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.trim()), (c) => c.charCodeAt(0)));

const OPS = {
  "Base64 encode": toB64,
  "Base64 decode": fromB64,
  "URL encode": encodeURIComponent,
  "URL decode": decodeURIComponent,
};

stride.commands.register("menu", async () => {
  const text = await stride.editor.getSelectedText();
  if (!text) return stride.window.showMessage("Select some text first.", "warning");
  const op = await stride.window.showQuickPick(Object.keys(OPS), "What should I do with the selection?");
  if (!op) return;
  try {
    await stride.editor.replaceSelection(OPS[op](text));
  } catch (e) {
    await stride.window.showMessage(`Couldn't ${op.toLowerCase()}: ${e.message}`, "error");
  }
});
