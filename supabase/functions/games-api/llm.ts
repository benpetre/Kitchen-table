/**
 * The two ways the generator talks to Claude: a schema-constrained JSON call
 * and a short web-search call for the day's topical brief.
 */
import Anthropic from "npm:@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";
// On a safety-classifier decline the API re-runs the request on a fallback
// model inside the same call instead of failing the day's puzzle.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export type Effort = "low" | "medium" | "high";
export type Turn = { role: "user" | "assistant"; content: string };

export interface JsonCall {
  system: string;
  messages: Turn[];
  /** JSON Schema: objects need additionalProperties false and every key required. */
  schema: Record<string, unknown>;
  effort?: Effort;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface Llm {
  /** Returns the parsed object and the raw JSON text (to replay on a retry). */
  json<T>(call: JsonCall): Promise<{ value: T; raw: string }>;
  /** Free text, with web search available. Throws if it cannot finish in time. */
  search(call: { system: string; user: string; timeoutMs: number; maxSearches: number }): Promise<string>;
  /** Token totals so far (input, output), for the generation report. */
  usage(): { input: number; output: number; calls: number };
}

const textOf = (content: Array<{ type: string; text?: string }>): string =>
  content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();

export function makeLlm(apiKey: string): Llm {
  const client = new Anthropic({ apiKey });
  const used = { input: 0, output: 0, calls: 0 };
  const count = (u?: { input_tokens?: number | null; output_tokens?: number | null }) => {
    used.calls++;
    used.input += u?.input_tokens ?? 0;
    used.output += u?.output_tokens ?? 0;
  };
  let fallbacksWork = true;

  return {
    usage: () => ({ ...used }),

    async json<T>(call: JsonCall) {
      const base = {
        model: MODEL,
        max_tokens: call.maxTokens ?? 16000,
        system: call.system,
        messages: call.messages,
        output_config: {
          effort: call.effort ?? "medium",
          format: { type: "json_schema" as const, schema: call.schema },
        },
      };
      const opts = { timeout: call.timeoutMs ?? 110_000, maxRetries: 1 };
      // deno-lint-ignore no-explicit-any
      let msg: any;
      if (fallbacksWork) {
        try {
          // deno-lint-ignore no-explicit-any
          msg = await client.beta.messages.stream({ ...base, betas: [FALLBACK_BETA], fallbacks: "default" } as any, opts).finalMessage();
        } catch (e) {
          // The beta flag or parameter was rejected: carry on without fallbacks.
          if (!(e instanceof Anthropic.BadRequestError)) throw e;
          console.warn("games-api: fallbacks request rejected, continuing without:", e.message);
          fallbacksWork = false;
        }
      }
      // deno-lint-ignore no-explicit-any
      if (!msg) msg = await client.messages.stream(base as any, opts).finalMessage();
      count(msg.usage);
      if (msg.stop_reason === "refusal") throw new Error(`model declined (${msg.stop_details?.category ?? "no category"})`);
      if (msg.stop_reason === "max_tokens") throw new Error("model ran out of output tokens");
      const raw = textOf(msg.content);
      return { value: JSON.parse(raw) as T, raw };
    },

    async search({ system, user, timeoutMs, maxSearches }) {
      const deadline = Date.now() + timeoutMs;
      // deno-lint-ignore no-explicit-any
      const messages: any[] = [{ role: "user", content: user }];
      // The server runs the search loop; pause_turn means "send it back to keep going".
      for (let turn = 0; turn < 3; turn++) {
        const left = deadline - Date.now();
        if (left < 5000) break;
        const msg = await client.messages.stream({
          model: MODEL,
          max_tokens: 4000,
          system,
          messages,
          output_config: { effort: "low" },
          tools: [{ type: "web_search_20260209", name: "web_search", max_uses: maxSearches }],
          // deno-lint-ignore no-explicit-any
        } as any, { timeout: left, maxRetries: 0 }).finalMessage();
        count(msg.usage);
        if (msg.stop_reason === "refusal") throw new Error("model declined the brief");
        if (msg.stop_reason !== "pause_turn") {
          // deno-lint-ignore no-explicit-any
          const text = textOf(msg.content as any);
          if (!text) throw new Error("empty brief");
          return text;
        }
        messages.push({ role: "assistant", content: msg.content });
      }
      throw new Error("brief did not finish in time");
    },
  };
}
