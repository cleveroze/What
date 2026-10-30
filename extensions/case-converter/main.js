// Case Converter — example extension.
// Shows how to: ask the user to pick from a list and replace the selection.

const words = (s) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

const CASES = {
  "camelCase": (s) => words(s).map((w, i) => (i ? cap(w) : w.toLowerCase())).join(""),
  "PascalCase": (s) => words(s).map(cap).join(""),
  "snake_case": (s) => words(s).map((w) => w.toLowerCase()).join("_"),
  "kebab-case": (s) => words(s).map((w) => w.toLowerCase()).join("-"),
  "CONSTANT_CASE": (s) => words(s).map((w) => w.toUpperCase()).join("_"),
  "Title Case": (s) => words(s).map(cap).join(" "),
  "UPPERCASE": (s) => s.toUpperCase(),
  "lowercase": (s) => s.toLowerCase(),
};

stride.commands.register("convert", async () => {
  const text = await stride.editor.getSelectedText();
  if (!text) return stride.window.showMessage("Select some text first.", "warning");
  const choice = await stride.window.showQuickPick(
    Object.keys(CASES).map((name) => ({ label: name, description: CASES[name](text).slice(0, 40), value: name })),
    "Convert selection to…",
  );
  if (choice) await stride.editor.replaceSelection(CASES[choice](text));
});
