import { useState } from "react";
import { ANTHROPIC_MODELS, describeAiError, fetchOpenRouterModels, PROVIDERS, setupProblem, streamChat } from "../../ai/providers";
import { preview } from "../../ipc/native";
import { useStore } from "../../lib/store";
import { secretsStore, setSecret, type Secrets } from "../../state/secrets";
import { setSetting, settingsStore } from "../../state/settings";
import { quickPick, reportError } from "../../state/ui";
import { Icon } from "../Icon";
import { LoadingIndicator, Shape } from "../Shape";
import { Button, IconButton, Select, Switch, TextField } from "../ui/controls";

function KeyField({ secret, placeholder }: { secret: keyof Secrets; placeholder: string }) {
  const value = useStore(secretsStore, (s) => s[secret]);
  const [shown, setShown] = useState(false);
  const [draft, setDraft] = useState(value);
  return (
    <div className="key-field">
      <input
        className="text-field mono"
        type={shown ? "text" : "password"}
        value={draft}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        aria-label="API key"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && setSecret(secret, draft)}
        onKeyDown={(e) => e.key === "Enter" && setSecret(secret, draft)}
      />
      <IconButton icon={shown ? "eye-off" : "eye"} label={shown ? "Hide key" : "Show key"} onClick={() => setShown(!shown)} />
    </div>
  );
}

function Row({ label, desc, children, wide }: { label: string; desc?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`setting-row ${wide ? "wide" : ""}`}>
      <div className="setting-text">
        <div className="setting-label">{label}</div>
        {desc && <div className="setting-desc">{desc}</div>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

export function AiSection() {
  const s = useStore(settingsStore, (x) => x);
  useStore(secretsStore, (x) => x);
  const provider = s["ai.provider"];
  const meta = PROVIDERS.find((p) => p.id === provider)!;
  const [test, setTest] = useState<{ state: "idle" | "running" | "ok" | "fail"; text: string }>({ state: "idle", text: "" });
  const [loadingModels, setLoadingModels] = useState(false);

  const runTest = async () => {
    setTest({ state: "running", text: "" });
    let reply = "";
    try {
      await streamChat({
        system: "Reply with one short friendly sentence.",
        messages: [{ role: "user", content: "Say hi to a new Stride user in under 12 words." }],
        signal: AbortSignal.timeout(60_000),
        onText: (d) => (reply += d),
      });
      setTest({ state: "ok", text: reply.trim() || "Connected." });
    } catch (e) {
      setTest({ state: "fail", text: describeAiError(e) });
    }
  };

  const pickOpenRouterModel = async () => {
    setLoadingModels(true);
    try {
      const models = await fetchOpenRouterModels();
      const id = await quickPick(
        models.map((m) => ({ label: m.name, description: m.id, value: m.id })),
        "Choose an OpenRouter model (type to search: claude, gpt, gemini, llama, free…)",
      );
      if (id) setSetting("ai.openrouterModel", id);
    } catch (e) {
      reportError("Cannot load the OpenRouter model list", e);
    } finally {
      setLoadingModels(false);
    }
  };

  return (
    <>
      <section className="settings-group">
        <h3>Provider</h3>
        <div className="ai-providers">
          {PROVIDERS.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={`ai-provider ${provider === p.id ? "selected" : ""}`}
              style={{ ["--i" as string]: i }}
              onClick={() => {
                setSetting("ai.provider", p.id);
                setTest({ state: "idle", text: "" });
              }}
            >
              <Shape name={(["sunny", "clover8", "cookie6"] as const)[i]} size={34} fill="var(--accent-soft)" />
              <span className="ai-provider-name">
                {p.name}
                {provider === p.id && <Icon name="check" size={14} />}
              </span>
              <span className="ai-provider-desc">{p.desc}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-group">
        <h3>{meta.name}</h3>
        <div className="settings-card">
          {provider !== "custom" && (
            <Row
              label="API key"
              wide
              desc={
                <>
                  Stored only on this computer, in Stride's settings folder — never in exported settings.{" "}
                  {meta.keyUrl && (
                    <a href={meta.keyUrl} onClick={(e) => { e.preventDefault(); preview.openExternal(meta.keyUrl!); }}>
                      Get a key →
                    </a>
                  )}
                </>
              }
            >
              <KeyField secret={provider === "anthropic" ? "anthropicKey" : "openrouterKey"} placeholder={provider === "anthropic" ? "sk-ant-…" : "sk-or-…"} />
            </Row>
          )}
          {provider === "anthropic" && (
            <Row label="Model" desc="Opus is the smartest, Haiku the fastest and cheapest.">
              <Select
                value={s["ai.anthropicModel"]}
                options={ANTHROPIC_MODELS.some((m) => m.value === s["ai.anthropicModel"]) ? ANTHROPIC_MODELS : [...ANTHROPIC_MODELS, { value: s["ai.anthropicModel"], label: s["ai.anthropicModel"] }]}
                onChange={(v) => setSetting("ai.anthropicModel", v)}
                label="Claude model"
              />
            </Row>
          )}
          {provider === "openrouter" && (
            <Row label="Model" desc="Any model available on OpenRouter — including free ones.">
              <Button variant="tonal" icon={loadingModels ? undefined : "search"} onClick={pickOpenRouterModel} disabled={loadingModels}>
                {loadingModels ? "Loading…" : s["ai.openrouterModel"] || "Choose a model…"}
              </Button>
            </Row>
          )}
          {provider === "custom" && (
            <>
              <Row label="Server address" wide desc="Ollama: http://localhost:11434/v1 · LM Studio: http://localhost:1234/v1">
                <TextField value={s["ai.customBaseUrl"]} onCommit={(v) => setSetting("ai.customBaseUrl", v.trim())} monospace label="Server address" />
              </Row>
              <Row label="Model name" desc="As your server names it, e.g. llama3.2 or qwen2.5-coder.">
                <TextField value={s["ai.customModel"]} onCommit={(v) => setSetting("ai.customModel", v.trim())} monospace placeholder="llama3.2" label="Model name" />
              </Row>
              <Row label="API key (optional)" wide desc="Only if your server needs one.">
                <KeyField secret="customKey" placeholder="optional" />
              </Row>
            </>
          )}
          <Row label="Share the open file" desc="Let the assistant see the file you're editing (and your selection). This code is sent to the provider.">
            <Switch checked={s["ai.includeFile"]} onChange={(v) => setSetting("ai.includeFile", v)} label="Share the open file" />
          </Row>
          <Row label="Test connection" desc={setupProblem() ?? "Sends a tiny request to check that everything works."}>
            <Button variant="tonal" icon="play" onClick={runTest} disabled={!!setupProblem() || test.state === "running"}>
              Test
            </Button>
          </Row>
          {test.state !== "idle" && (
            <div className={`ai-test ai-test-${test.state}`}>
              {test.state === "running" ? <LoadingIndicator size={22} label="Testing" /> : <Icon name={test.state === "ok" ? "success" : "error"} size={16} />}
              <span>{test.state === "running" ? "Talking to the AI…" : test.text}</span>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
