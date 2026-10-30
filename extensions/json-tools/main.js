async function transform(fn) {
  const selected = await stride.editor.getSelectedText();
  const text = selected || (await stride.editor.getText());
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return stride.window.showMessage(`That isn't valid JSON: ${e.message}`, "error");
  }
  const out = fn(data);
  if (selected) await stride.editor.replaceSelection(out);
  else await stride.editor.setText(out);
}

const sortDeep = (v) =>
  Array.isArray(v) ? v.map(sortDeep) :
  v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])])) : v;

stride.commands.register("format", () => transform((d) => JSON.stringify(d, null, 2)));
stride.commands.register("minify", () => transform((d) => JSON.stringify(d)));
stride.commands.register("sortKeys", () => transform((d) => JSON.stringify(sortDeep(d), null, 2)));
