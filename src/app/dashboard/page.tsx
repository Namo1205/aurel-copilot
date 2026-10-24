"use client";

import { useEffect, useState } from "react";
import { NOBODY_TO_HAND_TO, isPending, useSessionGuard, useStore, type InboxItem } from "@/lib/store";
import { Badge, Section, timeAgo } from "@/components/ui";
import { AI_OWNER_ID, QUEUE_LABEL, ROSTER, isOnShift, ownerName, type Queue } from "@/lib/desk/roster";
import { canSeeItem } from "@/lib/desk/visibility";
import { HOTELS } from "@/lib/pms";
import { CATEGORY_LABEL } from "@/lib/agent/schema";

const FLAG_AGE_MS = 2 * 3600000;

function ageMs(item: InboxItem, now: number) {
  return now - Date.parse(item.receivedAt);
}

function Stat({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: "rose" | "green" }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-stone-500">{label}</div>
      <div className={`text-2xl font-semibold leading-tight ${tone === "rose" ? "text-rose-700" : tone === "green" ? "text-emerald-800" : ""}`}>{value}</div>
      {hint ? <div className="text-[11px] text-stone-500 mt-0.5">{hint}</div> : null}
    </div>
  );
}

export default function Dashboard() {
  const session = useSessionGuard();
  const { state, dispatch } = useStore();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  if (!state.hydrated || !session) return <div className="p-6 text-sm text-stone-500">Loading…</div>;

  // Same visibility rule as the desk: agents see their own numbers, seniors their team's, managers everything.
  const items = state.order.map((id) => state.items[id]).filter((i) => canSeeItem(session, i));
  const pending = items.filter(isPending);
  const todayStart = new Date(now).setHours(0, 0, 0, 0);
  const handledToday = items.filter((i) => i.handledAt && Date.parse(i.handledAt) >= todayStart);
  const replyMins = handledToday.map((i) => (Date.parse(i.handledAt!) - Date.parse(i.receivedAt)) / 60000).sort((a, b) => a - b);
  const median = replyMins.length ? Math.round(replyMins[Math.floor(replyMins.length / 2)]) : null;
  const autoSent = items.filter((i) => i.autoSentAt);
  const autoCorrected = autoSent.filter((i) => i.typeOverride || (i.edited && i.status !== "auto_sent"));
  const offTopic = items.filter((i) => i.analysis?.proposal.triage.category === "off_topic");
  const oldest = pending.length ? Math.max(...pending.map((i) => ageMs(i, now))) : 0;
  const unowned = pending.filter((i) => i.analysis && !i.ownerId).length;
  const breaches = items.filter((i) => i.result?.sentReply && /\b(?:\d[ -]?){13,19}\b/.test(i.result.sentReply.body)).length + unowned;

  // Pending per owner with flags.
  const byOwner = new Map<string, InboxItem[]>();
  for (const i of pending) if (i.ownerId) byOwner.set(i.ownerId, [...(byOwner.get(i.ownerId) ?? []), i]);
  const humanOwners = [...byOwner.entries()].filter(([id]) => id !== AI_OWNER_ID);
  const avg = humanOwners.length ? humanOwners.reduce((s, [, l]) => s + l.length, 0) / humanOwners.length : 0;
  const flagged = (list: InboxItem[]) => list.some((i) => ageMs(i, now) > FLAG_AGE_MS) || (list.length >= 5 && list.length > 1.5 * avg);

  // Promises kept per hotel from the simulated PMS trace status.
  const perHotel = HOTELS.map((h) => {
    const t = state.traces.filter((x) => x.hotelId === h.id);
    return { hotel: h, total: t.length, done: t.filter((x) => x.status === "done").length, ack: t.filter((x) => x.status !== "open").length };
  }).filter((x) => x.total);

  const queues: Queue[] = ["agent", "manager", "sales", "auto"];
  const role = session.role;
  const handoversToday = state.handovers.filter((h) => Date.parse(h.at) >= todayStart);
  const stuck = pending.filter((i) => i.important.includes(NOBODY_TO_HAND_TO)).length;

  return (
    <div className="mx-auto max-w-[1200px] w-full p-6 space-y-6">
      <div className="flex items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-stone-600">
            {role === "manager" ? "The whole desk." : role === "senior" ? "You and the agents." : "Your own work."} Flags, not scores: an item is flagged when older than 2 hours, or when an owner has 5+ pending and more than 1.5× the desk average.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {role === "manager" || role === "senior" ? (
            <button
              onClick={() => dispatch({ type: "day_before_run", by: session.staffId })}
              className="text-xs px-3 py-1.5 rounded-md bg-brand text-white hover:bg-emerald-950"
              title="Sends the fixed day-before message to every booking arriving tomorrow; bookings with a request, a restricted trace or a VIP flag get a front-office call trace instead."
            >
              Run day-before check
            </button>
          ) : null}
          <span className="text-xs text-stone-500">
            Signed in as {session.name} · {role}
          </span>
        </div>
      </div>

      {/* Manager and everyone: the desk today */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <Stat label="Pending" value={pending.length} hint={pending.length ? `oldest ${Math.round(oldest / 60000)} min` : "inbox clear"} tone={oldest > FLAG_AGE_MS ? "rose" : undefined} />
        <Stat label="Replies today" value={handledToday.length} hint={median !== null ? `median ${median} min` : "none yet"} />
        <Stat label="Auto-sent" value={autoSent.length} hint={`${autoCorrected.length} corrected`} />
        <Stat label="Off-topic attempts" value={offTopic.length} hint="declined by template" />
        <Stat label="Unowned items" value={unowned} tone={unowned ? "rose" : "green"} hint="must be zero" />
        <Stat label="Guardrail breaches" value={breaches} tone={breaches ? "rose" : "green"} hint="card data sent · unowned" />
        <Stat label="Traces open" value={state.traces.filter((t) => t.status !== "done").length} hint={`${state.traces.length} total`} />
        <Stat label="Handovers today" value={handoversToday.length} hint={stuck ? `${stuck} stuck, nobody to hand to` : "shift ends, by owner rule"} tone={stuck ? "rose" : undefined} />
      </div>

      {handoversToday.length ? (
        <Section title="Handovers today · items that moved when someone went off shift">
          <ul className="text-sm space-y-1">
            {handoversToday.slice(0, 8).map((h, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-xs text-stone-500 tabular-nums">{new Date(h.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                <span>
                  {ownerName(h.from)} <span className="text-stone-400">→</span> {ownerName(h.to)}
                </span>
                <span className="text-xs text-stone-500 truncate">{state.items[h.itemId]?.message.fromName ?? h.itemId}</span>
                <span className="ml-auto text-xs text-stone-400">{h.reason}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Pending per queue">
          <table className="w-full text-sm">
            <tbody>
              {queues.map((q) => {
                const list = pending.filter((i) => i.queue === q);
                const old = list.length ? Math.max(...list.map((i) => ageMs(i, now))) : 0;
                return (
                  <tr key={q} className="border-b border-stone-100 last:border-0">
                    <td className="py-1.5 font-medium">{QUEUE_LABEL[q]}</td>
                    <td className="py-1.5 text-right">{list.length}</td>
                    <td className="py-1.5 text-right text-xs text-stone-500">{list.length ? `oldest ${Math.round(old / 60000)} min` : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>

        <Section title={role === "senior" || role === "manager" ? "Pending per owner" : "Your queue"}>
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wide text-stone-500">
              <tr>
                <th className="text-left font-medium py-1 pr-2">Owner</th>
                <th className="text-right font-medium py-1 px-2">Pending</th>
                <th className="text-right font-medium py-1 px-2">Oldest</th>
                <th className="text-right font-medium py-1 px-2">Resolved today</th>
                <th className="text-right font-medium py-1 px-2">Drafts edited</th>
                <th className="text-right font-medium py-1 pl-2">Type changed</th>
              </tr>
            </thead>
            <tbody>
              {ROSTER.filter((s) => (role === "agent" || role === "groups" ? s.id === session.staffId : isOnShift(s, new Date(now), state.shiftOverrides) || byOwner.has(s.id))).map((s) => {
                const list = byOwner.get(s.id) ?? [];
                const mine = items.filter((i) => i.handledBy === s.id && i.handledAt && Date.parse(i.handledAt) >= todayStart);
                const old = list.length ? Math.max(...list.map((i) => ageMs(i, now))) : 0;
                const f = flagged(list);
                return (
                  <tr key={s.id} className={`border-b border-stone-100 last:border-0 ${f ? "bg-rose-50/60" : ""}`}>
                    <td className="py-1.5">
                      {s.name} <span className="text-[11px] text-stone-500">{s.role}</span>
                      {f ? <Badge tone="rose">flag</Badge> : null}
                    </td>
                    <td className="py-1.5 text-right px-2">{list.length}</td>
                    <td className="py-1.5 text-right px-2 text-xs text-stone-500">{list.length ? `${Math.round(old / 60000)} min` : ""}</td>
                    <td className="py-1.5 text-right px-2">{mine.length}</td>
                    <td className="py-1.5 text-right px-2">{mine.filter((i) => i.edited).length}</td>
                    <td className="py-1.5 text-right pl-2">{items.filter((i) => i.handledBy === s.id && i.typeOverride).length}</td>
                  </tr>
                );
              })}
              {byOwner.has(AI_OWNER_ID) ? (
                <tr className="border-t border-stone-200">
                  <td className="py-1.5 text-stone-600">AI agent (sent alone)</td>
                  <td className="py-1.5 text-right">{byOwner.get(AI_OWNER_ID)!.length}</td>
                  <td colSpan={4}></td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Promises kept per hotel · from simulated PMS trace status">
          {perHotel.length ? (
            <table className="w-full text-sm">
              <tbody>
                {perHotel.map((x) => (
                  <tr key={x.hotel.id} className="border-b border-stone-100 last:border-0">
                    <td className="py-1.5 font-medium">{x.hotel.name}</td>
                    <td className="py-1.5 text-right">{x.done}/{x.total} done</td>
                    <td className="py-1.5 text-right text-xs text-stone-500">{Math.round((x.ack / x.total) * 100)}% acknowledged</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-stone-500">No traces yet. Approve a reply with a special request on the desk.</p>
          )}
        </Section>

        <Section title="Oldest open items">
          <ul className="text-sm space-y-1.5">
            {[...pending]
              .sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt))
              .slice(0, 6)
              .map((i) => (
                <li key={i.message.id} className="flex items-center gap-2">
                  <span className={`text-xs ${ageMs(i, now) > FLAG_AGE_MS ? "text-rose-700 font-medium" : "text-stone-500"}`}>{timeAgo(i.receivedAt)}</span>
                  <span className="truncate">{i.message.fromName}</span>
                  <span className="text-xs text-stone-500 truncate">{i.analysis ? CATEGORY_LABEL[i.typeOverride ?? i.analysis.proposal.triage.category] : "sorting…"}</span>
                  <span className="ml-auto text-xs text-stone-500">{ownerName(i.ownerId)}</span>
                  {role === "senior" || role === "manager" ? (
                    <select
                      value={i.ownerId ?? ""}
                      onChange={(e) => dispatch({ type: "reassign", id: i.message.id, ownerId: e.target.value, by: session.staffId })}
                      className="text-[11px] rounded border border-stone-300 bg-white px-1 py-0.5"
                      title="Reassign"
                    >
                      {ROSTER.filter((s) => isOnShift(s, new Date(now), state.shiftOverrides) || s.id === i.ownerId).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </li>
              ))}
            {!pending.length ? <li className="text-stone-500">Nothing pending.</li> : null}
          </ul>
        </Section>
      </div>
    </div>
  );
}
