// Prints what the day-before check does to an empty desk: one auto-sent item per
// booking arriving tomorrow, plus a front-office call trace where one is needed.
import { EMPTY_STATE, reducer, type State } from "@/lib/store";

const EMPTY: State = EMPTY_STATE;
const s = reducer(EMPTY, { type: "day_before_run", by: "mgr-1" });
for (const id of s.order) {
  const i = s.items[id];
  console.log(`${id} | ${i.status} | owner ${i.ownerId} | queue ${i.queue} | handledBy ${i.handledBy}`);
  console.log(`   ${i.message.subject}`);
  console.log(`   ${i.autoSentBody ? "message: " + i.autoSentBody.replace(/\s+/g, " ").slice(0, 140) + "…" : "no message: front-office call instead"}`);
}
for (const t of s.traces) console.log(`trace ${t.id} → ${t.department} · ${t.bookingId} · sensitive=${t.sensitive} · due ${t.due}\n   ${t.summary}`);
const again = reducer(s, { type: "day_before_run", by: "mgr-1" });
console.log("second run adds nothing:", again.order.length === s.order.length && again.traces.length === s.traces.length);
