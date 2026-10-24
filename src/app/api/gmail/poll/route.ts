import { NextResponse } from "next/server";
import { gmailConfigured, pullNewMessages } from "@/lib/gmail";

export const dynamic = "force-dynamic";

// The browser calls this every 20 seconds. New mail is labelled and marked read as
// it is taken, so each message reaches the desk once.
export async function GET() {
  if (!gmailConfigured()) return NextResponse.json({ messages: [] });
  try {
    const messages = await pullNewMessages();
    return NextResponse.json({ messages });
  } catch (e) {
    return NextResponse.json({ messages: [], error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
