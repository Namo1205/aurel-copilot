// Checks the two "reply failed" paths on the store without a mailbox:
// 1. sorting failed → a person takes the item and writes the reply;
// 2. Gmail could not deliver → the person sends the text again (edited) and the item is marked delivered.
import { EMPTY_STATE, reducer, type State } from "@/lib/store";

const EMPTY: State = EMPTY_STATE;
const msg = { id: "gmail-x1", channel: "email" as const, from: "guest@example.com", fromName: "Guest", subject: "Hello", body: "Hi there", receivedMinutesAgo: 0, gmail: { id: "x1", threadId: "t1", messageId: "<x1@example.com>" } };

let s = reducer(EMPTY, { type: "add_message", message: msg });
s = reducer(s, { type: "analyze_failed", id: msg.id, error: "network down" });
s = reducer(s, { type: "manual_start", id: msg.id, by: "agt-1" });
const it = s.items[msg.id];
console.log(`after manual_start: status=${it.status} owner=${it.ownerId} draft="${it.draft}" actions=${it.analysis?.proposal.actions.length} rule="${it.ownerRule}"`);

// Pretend the approved reply was executed but Gmail failed to deliver it.
s = reducer(s, { type: "executed", id: msg.id, status: "sent", by: "agt-1", result: { sentReply: { channel: "email", to: msg.from, body: "Dear Guest, thanks.", sentAt: new Date().toISOString(), deliveryError: "token expired" }, traces: [], bookingUpdates: [], handoffs: [], paymentLinks: [], skipped: [] } });
console.log(`after failed send: status=${s.items[msg.id].status} error="${s.items[msg.id].result?.sentReply?.deliveryError}"`);
s = reducer(s, { type: "resend_result", id: msg.id, ok: true, body: "Dear Guest, thanks a lot.", at: new Date().toISOString(), by: "agt-1" });
const r = s.items[msg.id].result?.sentReply;
console.log(`after resend: deliveredVia=${r?.deliveredVia} error=${r?.deliveryError} body="${r?.body}" edited=${s.items[msg.id].edited}`);

// Auto-sent policy answer that failed to deliver, then sent again by a person.
let a = reducer(EMPTY, { type: "add_message", message: { ...msg, id: "gmail-x2" } });
a = { ...a, items: { ...a.items, "gmail-x2": { ...a.items["gmail-x2"], status: "auto_sent", ownerId: "ai-agent", autoSentAt: new Date().toISOString(), autoSentBody: "Check-out is at 12:00.", delivery: { via: "gmail", at: new Date().toISOString(), error: "quota" } } } };
a = reducer(a, { type: "resend_result", id: "gmail-x2", ok: true, body: "Check-out is at 12:00. Luggage can be stored.", at: new Date().toISOString(), by: "agt-1" });
console.log(`auto-sent resend: error=${a.items["gmail-x2"].delivery?.error} body="${a.items["gmail-x2"].autoSentBody}" handledBy=${a.items["gmail-x2"].handledBy}`);
