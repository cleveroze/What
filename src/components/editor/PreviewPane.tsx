import { useEffect, useRef, useState } from "react";
import { basename } from "../../lib/path";
import { useStore } from "../../lib/store";
import { clamp } from "../../lib/util";
import { closePreview, openInBrowser, previewStore, reloadPreview } from "../../state/run";
import { Icon } from "../Icon";
import { Sash } from "../Sash";
import { IconButton } from "../ui/controls";

/** Live HTML preview served by the local preview server; reloads whenever a
 * file is saved. */
export function PreviewPane() {
  const p = useStore(previewStore, (s) => s);
  const startWidth = useRef(0);
  const [loading, setLoading] = useState(true);
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => setLoading(true), [p.nonce, p.url]);
  if (!p.open || !p.url) return null;
  return (
    <>
      <Sash
        orientation="vertical"
        label="Resize preview"
        onStart={() => (startWidth.current = p.width)}
        onDrag={(d) => {
          const total = hostRef.current?.parentElement?.clientWidth ?? 1000;
          previewStore.set((s) => ({ ...s, width: clamp(startWidth.current - d / total, 0.2, 0.8) }));
        }}
        onReset={() => previewStore.set((s) => ({ ...s, width: 0.45 }))}
      />
      <div className="preview-pane" ref={hostRef} style={{ flexBasis: `${p.width * 100}%` }}>
        <div className="preview-toolbar">
          <Icon name="globe" size={14} className="preview-globe" />
          <span className="preview-title" data-tip={p.url} data-tip-desc="Served by Stride's built-in local server. Saving any file refreshes the preview.">
            {p.path ? basename(p.path) : ""}
            <span className="preview-url">{p.url}</span>
          </span>
          {loading && <span className="preview-loading" aria-label="Loading" />}
          <IconButton icon="refresh" label="Reload preview" onClick={reloadPreview} />
          <IconButton icon="external" label="Open in browser" onClick={openInBrowser} />
          <IconButton icon="close" label="Close preview" onClick={closePreview} />
        </div>
        <iframe
          key={p.nonce}
          className="preview-frame"
          src={p.url}
          title="Live preview"
          sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin allow-downloads"
          onLoad={() => setLoading(false)}
        />
      </div>
    </>
  );
}
