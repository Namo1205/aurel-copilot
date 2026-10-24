// Shows the shift-end handover on a seeded desk, no key needed:
// sorts the sample messages with the rules engine, ends Carlos Mendes's shift,
// prints who received what, and checks a second run moves nothing.
//   npx tsx scripts/run-handover.ts
import { reducer, type State } from "@/lib/store";
import { SEED_MESSAGES } from "@/lib/inbox/seed";
import { analyzeWithRules } from "@/lib/agent/rules";
import { ownerName } from "@/lib/desk/roster";

const EMPTY: State = { items: {}, order: [], traces: [], handoffs: [], bookingUpdates: [], selectedId: null, hydrated: true, rotation: 0, session: null, gmail: null, samples: "none", shiftOverrides: {}, handovers: [] };

// A weekday at 11:00 desk time: early shift on, late shift not yet in.
const now = new Date();
now.setHours(11, 0, 0, 0);

let s = reducer(EMPTY, { type: "load_samples" });
for (const m of SEED_MESSAGES) {
  const proposal = analyzeWithRules(m, now);
  s = reducer(s, { type: "analyzed", id: m.id, analysis: { engine: "rules", model: undefined, latencyMs: 0, toolCalls: [], proposal } });
}
const owners = (st: State) => Object.fromEntries(st.order.map((id) => [id, st.items[id].ownerId]));
const before = owners(s);
const carlos = s.order.filter((id) => s.items[id].ownerId === "agt-2");
console.log(`Carlos owns ${carlos.length} item(s) before: ${carlos.map((id) => s.items[id].message.fromName).join(", ") || "none"}`);

s = reducer(s, { type: "shift_override", staffId: "agt-2", on: false });
const after = owners(s);
for (const id of s.order) {
  if (before[id] !== after[id]) console.log(`  ${s.items[id].message.fromName}: ${ownerName(before[id])} → ${ownerName(after[id])} · ${s.items[id].ownerRule}`);
}
console.log(`handovers logged: ${s.handovers.length}`);
console.log(`history on first moved item: ${JSON.stringify(s.items[s.handovers[0]?.itemId ?? s.order[0]].ownerHistory?.map((h) => `${h.from}→${h.to}`))}`);

const again = reducer(s, { type: "shift_override", staffId: "agt-2", on: false });
console.log(`second run moves nothing: ${JSON.stringify(owners(again)) === JSON.stringify(after)}`);

// Manager case: Inês ends her shift at 11:00 while Luca's late shift has not started.
const beforeMgr = owners(s);
s = reducer(s, { type: "shift_override", staffId: "mgr-1", on: false });
const stuck = s.order.filter((id) => s.items[id].important.includes("Owner off shift, nobody to hand to"));
console.log(`manager case: moved ${s.order.filter((id) => beforeMgr[id] !== owners(s)[id]).length}, stuck and flagged ${stuck.length} (${stuck.map((id) => s.items[id].message.fromName).join(", ")})`);
