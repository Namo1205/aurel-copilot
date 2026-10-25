import { NextResponse } from "next/server";
import { gmailConfigured, listThreadsPage, markTaken } from "@/lib/gmail";
import { getSession, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// One page of the whole mailbox for the automatic load when a desk opens. Answered
// messages come with the reply the desk sent; unanswered ones are marked taken here, so
// the poll and the scheduled check never auto-reply to mail a desk already holds.
// The client keeps calling with nextPageToken until it is null.
export async function POST(req: Request) {
  if (!(await getSession())) return unauthorized();
  if (!gmailConfigured()) return NextResponse.json({ items: [], nextPageToken: null, estimate: 0 });
  const body = (await req.json().catch(() => ({}))) as { pageToken?: string | null };
  try {
    const page = await listThreadsPage(body.pageToken ?? null);
    for (const item of page.items) {
      if (!item.taken && !item.reply) {
        await markTaken(item.message.gmail!.id);
        item.taken = true;
      }
    }
    return NextResponse.json(page);
  } catch (e) {
    return NextResponse.json({ items: [], nextPageToken: null, estimate: 0, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
