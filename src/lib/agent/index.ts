import type { InboundMessage } from "@/lib/inbox/seed";
import { analyzeWithRules } from "./rules";
import { topicCheck } from "./templates";
import type { AgentProposal } from "./schema";
import type { ToolCallLog } from "./gemini";

export type Engine = "gemini" | "rules";

export interface AnalysisResult {
  proposal: AgentProposal;
  engine: Engine;
  model?: string;
  toolCalls?: ToolCallLog[];
  latencyMs: number;
  fallbackError?: string;
}

export function defaultEngine(): Engine {
  if (process.env.COPILOT_MODE === "rules") return "rules";
  return process.env.GEMINI_API_KEY ? "gemini" : "rules";
}

export async function analyze(msg: InboundMessage, engine: Engine = defaultEngine()): Promise<AnalysisResult> {
  const started = Date.now();
  // Guardrail before the model: a message that fails the topic check is declined by
  // template without spending a model call on it.
  if (engine === "gemini" && !topicCheck(`${msg.subject ?? ""}
${msg.body}`).ok) {
    const proposal = analyzeWithRules(msg);
    return { proposal, engine: "rules", latencyMs: Date.now() - started };
  }
  if (engine === "gemini") {
    try {
      const { analyzeWithGemini } = await import("./gemini");
      const r = await analyzeWithGemini(msg);
      return { proposal: r.proposal, engine: "gemini", model: r.model, toolCalls: r.toolCalls, latencyMs: Date.now() - started };
    } catch (e) {
      const proposal = analyzeWithRules(msg);
      return { proposal, engine: "rules", latencyMs: Date.now() - started, fallbackError: e instanceof Error ? e.message : String(e) };
    }
  }
  const proposal = analyzeWithRules(msg);
  return { proposal, engine: "rules", latencyMs: Date.now() - started };
}
