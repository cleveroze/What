// Word Count — example extension.
// Shows how to: react to editor events, read text, and use the status bar.

function count(text) {
  const words = (text.match(/[\p{L}\p{N}'’_-]+/gu) || []).length;
  const lines = text ? text.split(/\r?\n/).length : 0;
  return { words, chars: text.length, lines, minutes: Math.max(1, Math.round(words / 200)) };
}

async function update() {
  const name = await stride.editor.getFileName();
  if (!name) return stride.statusBar.clear();
  const { words } = count(await stride.editor.getText());
  await stride.statusBar.set(`${words} words`, "Word Count — click the command “Show Word Count Details” for more");
}

stride.events.onDidChangeActiveEditor(update);
stride.events.onDidChangeText(update);
update();

stride.commands.register("details", async () => {
  const selected = await stride.editor.getSelectedText();
  const text = selected || (await stride.editor.getText());
  const c = count(text);
  await stride.window.showMessage(
    `${selected ? "Selection" : "File"}: ${c.words} words, ${c.chars} characters, ${c.lines} lines, ~${c.minutes} min to read.`,
  );
});
