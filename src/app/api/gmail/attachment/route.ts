import { NextResponse } from "next/server";
import { fetchAttachment, gmailConfigured } from "@/lib/gmail";
import { getSession, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Opens one file a guest attached, fetched from Gmail on demand for a signed-in desk
// member. Nothing is cached on the server or stored in the browser.
export async function GET(req: Request) {
  if (!(await getSession())) return unauthorized();
  if (!gmailConfigured()) return NextResponse.json({ error: "No mailbox connected." }, { status: 404 });
  const u = new URL(req.url);
  const messageId = u.searchParams.get("messageId") ?? "";
  const id = u.searchParams.get("id") ?? "";
  const name = (u.searchParams.get("name") ?? "attachment").replace(/[\r\n"\\]/g, "_");
  const type = u.searchParams.get("type") ?? "";
  if (!/^[\w-]+$/.test(messageId) || !id) return NextResponse.json({ error: "messageId and id are required." }, { status: 400 });
  const contentType = /^[\w.+-]+\/[\w.+-]+$/.test(type) ? type : "application/octet-stream";
  try {
    const data = await fetchAttachment(messageId, id);
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": contentType,
        "content-length": String(data.length),
        "content-disposition": `inline; filename="${name}"`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
