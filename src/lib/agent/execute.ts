// Executes the actions a human approved. This is the only place PMS writes happen.

import { applyModification, createTrace, getBooking, type Booking, type Trace } from "@/lib/pms";
import type { InboundMessage } from "@/lib/inbox/seed";
import type { AgentProposal, ProposedAction } from "./schema";
import { redactCards } from "./rules";

export interface Handoff {
  id: string;
  to: string;
  reason: string;
  urgency: string;
  context: string;
  messageId: string;
  createdAt: string;
}

export interface ExecutionResult {
  sentReply: { channel: string; to: string; body: string; sentAt: string } | null;
  traces: Trace[];
  bookingUpdates: Booking[];
  handoffs: Handoff[];
  paymentLinks: string[];
  skipped: { action: ProposedAction; reason: string }[];
}

export function execute(input: {
  message: InboundMessage;
  proposal: AgentProposal;
  approvedActionIndexes: number[];
  draftReply: string;
  sendReply: boolean;
}): ExecutionResult {
  const { message, proposal, approvedActionIndexes, draftReply, sendReply } = input;
  const result: ExecutionResult = { sentReply: null, traces: [], bookingUpdates: [], handoffs: [], paymentLinks: [], skipped: [] };
  const now = new Date().toISOString();

  for (const idx of approvedActionIndexes) {
    const action = proposal.actions[idx];
    if (!action) continue;
    switch (action.type) {
      case "create_trace":
        result.traces.push(
          createTrace({
            hotelId: action.hotelId,
            bookingId: action.bookingId,
            department: action.department,
            summary: action.summary,
            due: action.due,
            sensitive: action.sensitive,
            source: `copilot:${message.id}`,
          }),
        );
        break;
      case "modify_booking": {
        const b = getBooking(action.bookingId);
        if (!b) {
          result.skipped.push({ action, reason: "Booking not found." });
          break;
        }
        try {
          result.bookingUpdates.push(applyModification(b, action.changes));
        } catch (e) {
          result.skipped.push({ action, reason: e instanceof Error ? e.message : String(e) });
        }
        break;
      }
      case "handoff":
        result.handoffs.push({
          id: `HO-${Date.now().toString(36).toUpperCase().slice(-5)}${idx}`,
          to: action.to,
          reason: action.reason,
          urgency: action.urgency,
          context: action.context,
          messageId: message.id,
          createdAt: now,
        });
        break;
      case "send_payment_link":
        result.paymentLinks.push(`https://pay.aurelhotels.example/l/${Math.random().toString(36).slice(2, 10)}`);
        break;
      case "quote":
        // Informational; the numbers are already in the reply.
        break;
    }
  }

  if (sendReply) {
    let body = redactCards(draftReply);
    if (result.paymentLinks.length) body = body.replace("[Secure payment link will be inserted on send]", result.paymentLinks[0]);
    result.sentReply = { channel: message.channel, to: message.from, body, sentAt: now };
  }
  return result;
}
