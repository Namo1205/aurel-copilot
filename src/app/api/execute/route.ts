import { NextResponse } from "next/server";
import { execute } from "@/lib/agent/execute";
import { AgentProposal } from "@/lib/agent/schema";
import type { InboundMessage } from "@/lib/inbox/seed";
import { gmailSendEnabled, sendReply } from "@/lib/gmail";


export async function POST(req: Request) {
  const body = (await req.json()) as {
    message: InboundMessage;
    proposal: unknown;
    approvedActionIndexes: number[];
    draftReply: string;
    sendReply: boolean;
  };
  const parsed = AgentProposal.safeParse(body.proposal);
  if (!parsed.success) return NextResponse.json({ error: "invalid proposal" }, { status: 400 });
  const result = execute({
    message: body.message,
    proposal: parsed.data,
    approvedActionIndexes: body.approvedActionIndexes ?? [],
    draftReply: body.draftReply ?? parsed.data.draftReply,
    sendReply: body.sendReply !== false,
  });
  // Live Gmail: the approved reply really goes back to the guest, in the same thread.
  if (result.sentReply && body.message.gmail && gmailSendEnabled()) {
    try {
      await sendReply({ message: body.message, body: result.sentReply.body });
      result.sentReply.deliveredVia = "gmail";
    } catch (e) {
      result.sentReply.deliveryError = e instanceof Error ? e.message : String(e);
    }
  }
  return NextResponse.json(result);
}
