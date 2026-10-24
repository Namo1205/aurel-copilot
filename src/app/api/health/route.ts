import { NextResponse } from "next/server";
import { defaultEngine } from "@/lib/agent";
import { DAILY_LIMIT, MODEL, MODELS, USAGE } from "@/lib/agent/gemini";

export async function GET() {
  const engine = defaultEngine();
  const usage = MODELS.map((m) => ({ model: m, used: USAGE[m] ?? 0, limit: DAILY_LIMIT }));
  const used = usage.reduce((s, u) => s + u.used, 0);
  return NextResponse.json({ engine, model: engine === "gemini" ? MODEL : null, models: engine === "gemini" ? MODELS : [], usage, used, capacity: MODELS.length * DAILY_LIMIT });
}
