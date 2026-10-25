import { NextResponse } from "next/server";
import { sendReply } from "@/lib/gmail";
import type { InboundMessage } from "@/lib/inbox/seed";
import { getSession, unauthorized } from "@/lib/auth";

// Used for the texts the AI agent sends alone (cited policy answers and the fixed
// templates). Approved replies go through /api/execute instead.
export async function POST(req: Request) {
  if (!(await getSession())) return unauthorized();
  const body = (await req.json()) as { message: InboundMessage; body: string };
  if (!body?.message?.gmail || !body.body) return NextResponse.json({ error: "message with gmail metadata and a body are required" }, { status: 400 });
  try {
    const sent = await sendReply({ message: body.message, body: body.body });
    return NextResponse.json({ ok: true, ...sent, at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
