// AI Commenter — example extension using the "ai" permission.
// stride.ai.complete(prompt, system) sends a prompt to the AI provider the
// user configured in Settings → AI and returns the answer as text.

stride.commands.register("document", async () => {
  const code = await stride.editor.getSelectedText();
  if (!code.trim()) return stride.window.showMessage("Select a function or block of code first.", "warning");
  const language = (await stride.editor.getLanguage()) || "code";
  await stride.statusBar.set("✍ Writing comment…");
  try {
    const answer = await stride.ai.complete(
      `Write a short documentation comment for this ${language} code. ` +
        "Use the comment style of the language (JSDoc, docstring, ///, ...). " +
        "Reply with the comment followed by the original code, and nothing else — no code fences.\n\n" +
        code,
      "You write concise, accurate documentation comments.",
    );
    const cleaned = answer.replace(/^```[\w-]*\n?/, "").replace(/\n?```\s*$/, "");
    await stride.editor.replaceSelection(cleaned);
  } catch (e) {
    await stride.window.showMessage(String(e.message || e), "error");
  } finally {
    await stride.statusBar.clear();
  }
});
