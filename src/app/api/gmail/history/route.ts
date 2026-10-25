import { NextResponse } from "next/server";
import { gmailConfigured, listTakenMessages } from "@/lib/gmail";
import { getSession, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// What the desk has taken from the mailbox recently, with the desk's reply to each
// message where there is one. Used by "Reload from the mailbox" to rebuild a fresh
// or cleared browser. Reads only; nothing is labelled or sent.
export async function GET(req: Request) {
  if (!(await getSession())) return unauthorized();
  if (!gmailConfigured()) return NextResponse.json({ messages: [] });
  const days = Math.min(7, Math.max(1, Number(new URL(req.url).searchParams.get("days") ?? 3) || 3));
  try {
    const messages = await listTakenMessages(days);
    return NextResponse.json({ messages, days });
  } catch (e) {
    return NextResponse.json({ messages: [], error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
