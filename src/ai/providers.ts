/** AI providers. Claude uses the official Anthropic SDK; OpenRouter and any
 * OpenAI-compatible server (Ollama, LM Studio, ...) use their HTTP API. */
import Anthropic from "@anthropic-ai/sdk";
import { getSetting, type AiProvider } from "../state/settings";
import { secretsStore } from "../state/secrets";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  onText: (delta: string) => void;
  signal: AbortSignal;
}

export interface ChatResult {
  /** Why generation stopped, normalised across providers. */
  stop: "done" | "length" | "refused";
  model: string;
}

export class AiSetupError extends Error {}

export const ANTHROPIC_MODELS = [
  { value: "claude-opus-5-5", label: "Claude Opus 5.5 — most capable" },
  { value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 — fast and smart" },
  { value: "claude-haiku-5-5", label: "Claude Haiku 5.5 — fastest, cheapest" },
];

export const PROVIDERS: { id: AiProvider; name: string; keyUrl?: string; desc: string }[] = [
  { id: "anthropic", name: "Claude (Anthropic)", keyUrl: "https://platform.claude.com/settings/keys", desc: "Claude models directly from Anthropic." },
  { id: "openrouter", name: "OpenRouter", keyUrl: "https://openrouter.ai/settings/keys", desc: "One key for hundreds of models: Claude, GPT, Gemini, Llama, DeepSeek and more." },
  { id: "custom", name: "OpenAI-compatible server", desc: "Ollama, LM Studio, a company gateway… Local models are free and private." },
];

export function activeModelLabel(): string {
  const p = getSetting("ai.provider");
  if (p === "anthropic") return ANTHROPIC_MODELS.find((m) => m.value === getSetting("ai.anthropicModel"))?.label.split(" —")[0] ?? getSetting("ai.anthropicModel");
  if (p === "openrouter") return getSetting("ai.openrouterModel") || "no model selected";
  return getSetting("ai.customModel") || "no model selected";
}

/** Returns a reason the assistant can't run yet, or null when ready. */
export function setupProblem(): string | null {
  const p = getSetting("ai.provider");
  const s = secretsStore.get();
  if (p === "anthropic" && !s.anthropicKey) return "Add your Anthropic API key to start chatting with Claude.";
  if (p === "openrouter" && !s.openrouterKey) return "Add your OpenRouter API key to use its models.";
  if (p === "openrouter" && !getSetting("ai.openrouterModel")) return "Pick an OpenRouter model.";
  if (p === "custom" && !getSetting("ai.customBaseUrl")) return "Enter the address of your OpenAI-compatible server.";
  if (p === "custom" && !getSetting("ai.customModel")) return "Enter the model name to use on your server.";
  return null;
}

// ---------- Claude ----------

/** Models that accept server-side refusal fallbacks (`fallbacks: "default"`). */
const FALLBACK_MODELS = /^claude-(opus-5|sonnet-5-5|fable)/;

async function chatAnthropic(req: ChatRequest): Promise<ChatResult> {
  const model = getSetting("ai.anthropicModel");
  const client = new Anthropic({
    apiKey: secretsStore.get().anthropicKey,
    // Stride is a desktop app; the key is the user's own and stays on their PC.
    dangerouslyAllowBrowser: true,
  });
  const fallback = FALLBACK_MODELS.test(model);
  const stream = client.beta.messages.stream(
    {
      model,
      max_tokens: 64000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: req.system,
      messages: req.messages,
      // On a safety decline, let the API retry on its recommended fallback model.
      ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    },
    { signal: req.signal },
  );
  stream.on("text", (delta) => req.onText(delta));
  const message = await stream.finalMessage();
  return {
    stop: message.stop_reason === "refusal" ? "refused" : message.stop_reason === "max_tokens" ? "length" : "done",
    model: message.model,
  };
}

// ---------- OpenAI-compatible (OpenRouter, Ollama, LM Studio, ...) ----------

async function chatOpenAiCompatible(req: ChatRequest, baseUrl: string, apiKey: string, model: string, extraHeaders: Record<string, string> = {}): Promise<ChatResult> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    signal: req.signal,
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [{ role: "system", content: req.system }, ...req.messages],
    }),
  });
  if (!res.ok || !res.body) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      detail = body?.error?.message ?? JSON.stringify(body);
    } catch {
      /* not JSON */
    }
    throw new Error(`The server answered with an error: ${detail}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finish: string | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const json = JSON.parse(data);
        if (json.error) throw new Error(json.error.message ?? "Stream error");
        const choice = json.choices?.[0];
        const delta = choice?.delta?.content;
        if (delta) req.onText(delta);
        if (choice?.finish_reason) finish = choice.finish_reason;
      } catch (e) {
        if (e instanceof SyntaxError) continue; // keep-alive comments etc.
        throw e;
      }
    }
  }
  return { stop: finish === "length" ? "length" : finish === "content_filter" ? "refused" : "done", model };
}

/** Streams one assistant reply from the configured provider. */
export async function streamChat(req: ChatRequest): Promise<ChatResult> {
  const problem = setupProblem();
  if (problem) throw new AiSetupError(problem);
  const provider = getSetting("ai.provider");
  const s = secretsStore.get();
  if (provider === "anthropic") return chatAnthropic(req);
  if (provider === "openrouter") {
    return chatOpenAiCompatible(req, "https://openrouter.ai/api/v1", s.openrouterKey, getSetting("ai.openrouterModel"), {
      "HTTP-Referer": "https://github.com/cleveroze/What",
      "X-Title": "Stride",
    });
  }
  return chatOpenAiCompatible(req, getSetting("ai.customBaseUrl"), s.customKey, getSetting("ai.customModel"));
}

/** Turns provider errors into something a beginner can act on. */
export function describeAiError(e: unknown): string {
  if (e instanceof AiSetupError) return e.message;
  if (e instanceof Anthropic.AuthenticationError) return "The Anthropic API key was rejected. Check it in Settings → AI.";
  if (e instanceof Anthropic.PermissionDeniedError) return "This API key isn't allowed to use that model.";
  if (e instanceof Anthropic.NotFoundError) return "That model wasn't found. Pick another one in Settings → AI.";
  if (e instanceof Anthropic.RateLimitError) return "Too many requests right now — wait a moment and try again.";
  if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach Anthropic. Check your internet connection.";
  if (e instanceof Anthropic.APIError) return `Anthropic API error ${e.status ?? ""}: ${e.message}`;
  if (e instanceof TypeError && /fetch/i.test(e.message)) return "Couldn't reach the AI server. Check the address and your connection (for Ollama: is it running?).";
  return e instanceof Error ? e.message : String(e);
}

/** Lists models offered by OpenRouter (public endpoint, no key needed). */
export async function fetchOpenRouterModels(): Promise<{ id: string; name: string }[]> {
  const res = await fetch("https://openrouter.ai/api/v1/models");
  if (!res.ok) throw new Error(`OpenRouter returned ${res.status}`);
  const json = await res.json();
  return (json.data ?? []).map((m: { id: string; name?: string }) => ({ id: m.id, name: m.name ?? m.id }));
}
