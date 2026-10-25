import { NextResponse } from "next/server";
import { execute } from "@/lib/agent/execute";
import { AgentProposal } from "@/lib/agent/schema";
import type { InboundMessage } from "@/lib/inbox/seed";
import { attachmentsTooLarge, gmailSendEnabled, sendReply, type OutgoingAttachment } from "@/lib/gmail";
import { getSession, unauthorized } from "@/lib/auth";

export async function POST(req: Request) {
  if (!(await getSession())) return unauthorized();
  const body = (await req.json()) as {
    message: InboundMessage;
    proposal: unknown;
    approvedActionIndexes: number[];
    draftReply: string;
    sendReply: boolean;
    attachments?: OutgoingAttachment[];
  };
  const parsed = AgentProposal.safeParse(body.proposal);
  if (!parsed.success) return NextResponse.json({ error: "invalid proposal" }, { status: 400 });
  const attachments = Array.isArray(body.attachments) ? body.attachments.filter((a) => a && typeof a.name === "string" && typeof a.dataBase64 === "string") : [];
  if (attachmentsTooLarge(attachments)) return NextResponse.json({ error: "Attachments are limited to 4 MB in total." }, { status: 413 });
  const result = execute({
    message: body.message,
    proposal: parsed.data,
    approvedActionIndexes: body.approvedActionIndexes ?? [],
    draftReply: body.draftReply ?? parsed.data.draftReply,
    sendReply: body.sendReply !== false,
    attachments: attachments.map((a) => ({ name: a.name, size: Math.floor((a.dataBase64.length * 3) / 4) })),
  });
  // Live Gmail: the approved reply really goes back to the guest, in the same thread.
  if (result.sentReply && body.message.gmail && gmailSendEnabled()) {
    try {
      await sendReply({ message: body.message, body: result.sentReply.body, attachments });
      result.sentReply.deliveredVia = "gmail";
    } catch (e) {
      result.sentReply.deliveryError = e instanceof Error ? e.message : String(e);
    }
  }
  return NextResponse.json(result);
}
