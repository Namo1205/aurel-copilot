import type { InboundMessage } from "@/lib/inbox/seed";
import { analyzeWithRules } from "./rules";
import type { AgentProposal } from "./schema";
import type { ToolCallLog } from "./claude";

export type Engine = "claude" | "rules";

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
  return process.env.ANTHROPIC_API_KEY ? "claude" : "rules";
}

export async function analyze(msg: InboundMessage, engine: Engine = defaultEngine()): Promise<AnalysisResult> {
  const started = Date.now();
  if (engine === "claude") {
    try {
      const { analyzeWithClaude } = await import("./claude");
      const r = await analyzeWithClaude(msg);
      return { proposal: r.proposal, engine: "claude", model: r.model, toolCalls: r.toolCalls, latencyMs: Date.now() - started };
    } catch (e) {
      const proposal = analyzeWithRules(msg);
      return {
        proposal,
        engine: "rules",
        latencyMs: Date.now() - started,
        fallbackError: e instanceof Error ? e.message : String(e),
      };
    }
  }
  const proposal = analyzeWithRules(msg);
  return { proposal, engine: "rules", latencyMs: Date.now() - started };
}
