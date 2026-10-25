// Executes the actions a human approved. This is the only place PMS writes happen.

import { applyModification, checkModification, createTrace, getBooking, type Booking, type Trace } from "@/lib/pms";
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

export interface SentAttachment {
  name: string;
  size: number;
}

export interface ExecutionResult {
  sentReply: { channel: string; to: string; body: string; sentAt: string; deliveredVia?: "gmail"; deliveryError?: string; attachments?: SentAttachment[] } | null;
  traces: Trace[];
  bookingUpdates: Booking[];
  handoffs: Handoff[];
  paymentLinks: string[];
  skipped: { action: ProposedAction; reason: string }[];
  // Set when nothing was done or sent: the reason, for the owner. PRD: a write that fails
  // sends nothing and returns the item with the error.
  blocked?: string;
}

// Does the reply tell the guest a booking change has already been made?
const CLAIMS_CHANGE = /\b(have|has been|is now|we've|i've|has now been|are now)\s+(successfully\s+)?(updated|changed|moved|modified|amended|rebooked)\b[^.]{0,80}\b(reservation|booking|dates|stay)\b|\b(reservation|booking)\b[^.]{0,40}\b(has been|is now)\s+(updated|changed|moved|modified|amended)/i;

type ChangeAction = Extract<ProposedAction, { type: "modify_booking" }>;

export function execute(input: {
  message: InboundMessage;
  proposal: AgentProposal;
  approvedActionIndexes: number[];
  draftReply: string;
  sendReply: boolean;
  attachments?: SentAttachment[];
}): ExecutionResult {
  const { message, proposal, approvedActionIndexes, draftReply, sendReply, attachments } = input;
  const result: ExecutionResult = { sentReply: null, traces: [], bookingUpdates: [], handoffs: [], paymentLinks: [], skipped: [] };
  const now = new Date().toISOString();

  // Guardrails before anything is written or sent. A reply never confirms a change the
  // PMS did not make: the change is checked first, and a reply that says "we have moved
  // your booking" cannot go out while that change is unticked.
  const changes = proposal.actions.map((a, i) => ({ a, i })).filter((x): x is { a: ChangeAction; i: number } => x.a.type === "modify_booking");
  for (const { a, i } of changes) {
    if (!approvedActionIndexes.includes(i)) continue;
    const b = getBooking(a.bookingId);
    const chk = b ? checkModification(b, a.changes) : { allowed: false, reason: "Booking not found." };
    if (!chk.allowed) return { ...result, blocked: `The PMS change for ${a.bookingId} could not be made: ${chk.reason} Nothing was sent; the conversation stays with you.` };
  }
  if (sendReply && changes.some(({ i }) => !approvedActionIndexes.includes(i)) && CLAIMS_CHANGE.test(draftReply)) {
    return { ...result, blocked: "The reply tells the guest the booking has been changed, but the change is unticked. Tick it, or reword the reply. Nothing was sent." };
  }

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
            source: `Aurel Assistant:${message.id}`,
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
    result.sentReply = { channel: message.channel, to: message.from, body, sentAt: now, attachments: attachments?.length ? attachments : undefined };
  }
  return result;
}
