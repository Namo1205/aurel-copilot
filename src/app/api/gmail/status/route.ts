import { NextResponse } from "next/server";
import { gmailConfigured, gmailSendEnabled, profile } from "@/lib/gmail";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!gmailConfigured()) return NextResponse.json({ configured: false, address: null, send: false });
  try {
    const p = await profile();
    return NextResponse.json({ configured: true, address: p.emailAddress, send: gmailSendEnabled() });
  } catch (e) {
    return NextResponse.json({ configured: true, address: null, send: false, error: e instanceof Error ? e.message : String(e) });
  }
}
