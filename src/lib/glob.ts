/** Compiles a comma separated list of simple globs (`*`, `?`, `**`) matched
 * against file/folder names or workspace-relative paths. */
export function compileGlobs(list: string): (name: string, relPath: string) => boolean {
  const patterns = list
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const byPath = p.includes("/");
      const source = p
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*\/?/g, "\u0000")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]")
        .replace(/\u0000/g, ".*");
      return { byPath, re: new RegExp(`^${source}$`, "i") };
    });
  if (!patterns.length) return () => false;
  return (name, relPath) => {
    const rel = relPath.replace(/\\/g, "/");
    return patterns.some(({ byPath, re }) => (byPath ? re.test(rel) : re.test(name)));
  };
}
