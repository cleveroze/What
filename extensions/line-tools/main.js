const OPS = {
  "Sort A → Z": (l) => [...l].sort((a, b) => a.localeCompare(b)),
  "Sort Z → A": (l) => [...l].sort((a, b) => b.localeCompare(a)),
  "Sort by length": (l) => [...l].sort((a, b) => a.length - b.length),
  "Reverse": (l) => [...l].reverse(),
  "Shuffle": (l) => l.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]),
  "Remove duplicates": (l) => [...new Set(l)],
  "Remove empty lines": (l) => l.filter((x) => x.trim()),
  "Trim spaces": (l) => l.map((x) => x.trim()),
  "Number lines": (l) => l.map((x, i) => `${i + 1}. ${x}`),
};

stride.commands.register("menu", async () => {
  const selected = await stride.editor.getSelectedText();
  const text = selected || (await stride.editor.getText());
  const op = await stride.window.showQuickPick(Object.keys(OPS), selected ? "Apply to selected lines" : "Apply to the whole file");
  if (!op) return;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const result = OPS[op](text.split(/\r?\n/)).join(eol);
  if (selected) await stride.editor.replaceSelection(result);
  else await stride.editor.setText(result);
});
