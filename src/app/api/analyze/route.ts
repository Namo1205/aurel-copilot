import { NextResponse } from "next/server";
import { analyze, type Engine } from "@/lib/agent";
import type { InboundMessage } from "@/lib/inbox/seed";

export const maxDuration = 120;

export async function POST(req: Request) {
  const body = (await req.json()) as { message: InboundMessage; engine?: Engine };
  if (!body?.message?.body) return NextResponse.json({ error: "message required" }, { status: 400 });
  const result = await analyze(body.message, body.engine);
  return NextResponse.json(result);
}
