import { NextResponse } from "next/server";
import { defaultEngine } from "@/lib/agent";
import { MODEL } from "@/lib/agent/claude";


export async function GET() {
  const engine = defaultEngine();
  return NextResponse.json({ engine, model: engine === "claude" ? MODEL : null });
}
