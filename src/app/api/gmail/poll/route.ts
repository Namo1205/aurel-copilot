import { NextResponse } from "next/server";
import { gmailConfigured, gmailSendEnabled, ownReplyInThread, pullNewMessages, sendReply } from "@/lib/gmail";
import { analyze } from "@/lib/agent";
import { getSession, unauthorized } from "@/lib/auth";
import type { AutoSend, Category } from "@/lib/agent/schema";

// When the scheduled check answered a message and the desk's own sorting now says
// "nothing to send alone" (the two engines can differ), name the template from the type.
function autoKindFor(category: Category): AutoSend["kind"] {
  if (category === "group_event") return "group_ack";
  if (category === "cancellation_refund") return "holding_reply";
  if (category === "off_topic") return "off_topic_decline";
  return "policy_answer";
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Polls new mail and triages it server-side. Anything the AI agent may send alone
// (cited policy answer, holding reply, group acknowledgement, decline) goes out here,
// before the message reaches a desk. Called every 20 seconds by each open desk tab.
export async function GET() {
  if (!(await getSession())) return unauthorized();
  if (!gmailConfigured()) return NextResponse.json({ messages: [] });
  try {
    const messages = await pullNewMessages();

    for (const msg of messages) {
      try {
        const analysis = await analyze(msg);
        msg.serverAnalysis = analysis;

        if (msg.gmail?.autoReplied) {
          // The scheduled check already replied. Show what it sent; send nothing.
          const prior = await ownReplyInThread(msg.gmail.threadId).catch(() => null);
          const p = analysis.proposal;
          if (p.autoSend.kind === "none") {
            p.autoSend = { kind: autoKindFor(p.triage.category), reason: "Sent by the scheduled check before a desk tab was open.", body: prior?.body };
          }
          const at = prior?.at ?? new Date().toISOString();
          msg.serverAutoSent = { kind: p.autoSend.kind, body: prior?.body || p.autoSend.body || p.draftReply, at, delivery: { via: "gmail", at } };
          continue;
        }

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
