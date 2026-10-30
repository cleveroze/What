const WORDS = ("lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna " +
  "aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure " +
  "in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa " +
  "qui officia deserunt mollit anim id est laborum").split(" ");

const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)];
const sentence = () => {
  const n = 6 + Math.floor(Math.random() * 10);
  const s = Array.from({ length: n }, pick).join(" ");
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
};
const paragraph = () => Array.from({ length: 3 + Math.floor(Math.random() * 4) }, sentence).join(" ");

stride.commands.register("insert", async () => {
  const kind = await stride.window.showQuickPick(["Paragraphs", "Sentences", "Words"], "What should I insert?");
  if (!kind) return;
  const raw = await stride.window.showInput(`How many ${kind.toLowerCase()}?`, kind === "Words" ? "20" : "2");
  const n = Math.min(200, Math.max(1, parseInt(raw, 10) || 1));
  const text =
    kind === "Paragraphs" ? Array.from({ length: n }, paragraph).join("\n\n") :
    kind === "Sentences" ? Array.from({ length: n }, sentence).join(" ") :
    ["Lorem", ...Array.from({ length: n - 1 }, pick)].join(" ");
  await stride.editor.insertText(text);
});
