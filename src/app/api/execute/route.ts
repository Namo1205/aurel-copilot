import { NextResponse } from "next/server";
import { execute } from "@/lib/agent/execute";
import { AgentProposal } from "@/lib/agent/schema";
import type { InboundMessage } from "@/lib/inbox/seed";


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
  return NextResponse.json(result);
}
