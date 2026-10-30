stride.commands.register("insert", async () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const formats = {
    "ISO 8601": now.toISOString(),
    "Date (YYYY-MM-DD)": `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    "Time (HH:MM)": `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    "Local date and time": now.toLocaleString(),
    "Unix seconds": String(Math.floor(now.getTime() / 1000)),
    "Unix milliseconds": String(now.getTime()),
  };
  const choice = await stride.window.showQuickPick(
    Object.entries(formats).map(([label, value]) => ({ label, description: value, value })),
    "Insert which format?",
  );
  if (choice) await stride.editor.insertText(choice);
});
