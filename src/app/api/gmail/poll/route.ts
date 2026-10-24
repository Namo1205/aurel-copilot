import { NextResponse } from "next/server";
import { gmailConfigured, gmailSendEnabled, pullNewMessages, sendReply } from "@/lib/gmail";
import { analyze } from "@/lib/agent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Polls new mail and automatically triages & replies server-side,
// ensuring the AI Agent replies even if no staff member is logged in.
export async function GET() {
  if (!gmailConfigured()) return NextResponse.json({ messages: [] });
  try {
    const messages = await pullNewMessages();

    for (const msg of messages) {
      try {
        const analysis = await analyze(msg);
        msg.serverAnalysis = analysis;

        const auto = analysis.proposal.autoSend;
        if (auto && auto.kind !== "none" && gmailSendEnabled()) {
          const bodyToSend = auto.body || analysis.proposal.draftReply;
          if (bodyToSend) {
            try {
              await sendReply({ message: msg, body: bodyToSend });
              msg.serverAutoSent = {
                kind: auto.kind,
                body: bodyToSend,
                at: new Date().toISOString(),
                delivery: { via: "gmail", at: new Date().toISOString() },
              };
            } catch (sendErr) {
              msg.serverAutoSent = {
                kind: auto.kind,
                body: bodyToSend,
                at: new Date().toISOString(),
                delivery: {
                  via: "gmail",
                  at: new Date().toISOString(),
                  error: sendErr instanceof Error ? sendErr.message : String(sendErr),
                },
              };
            }
          }
        }
      } catch {
        // Individual analysis error fallback; message is still returned to desk
      }
    }

    return NextResponse.json({ messages });
  } catch (e) {
    return NextResponse.json({ messages: [], error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
