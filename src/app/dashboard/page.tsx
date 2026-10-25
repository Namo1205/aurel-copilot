"use client";

// The dashboard the whole desk sees (PRD Flow C). Three numbers lead: waiting, replied
// today, promises kept. Anything that breaks a guardrail shows as one red line, only when
// it is not zero. Then one table of who is waiting on whom, and the oldest items.
// Flags, not scores: the board shows items, never a ranking of people.

import { useEffect, useState } from "react";
import { NOBODY_TO_HAND_TO, isPending, ownerLabel, useSessionGuard, useStore, type InboxItem } from "@/lib/store";
import { Badge, Section, timeAgo } from "@/components/ui";
import { AI_OWNER_ID, ASSISTANT_NAME, ROSTER, isOnShift, ownerName } from "@/lib/desk/roster";
import { canSeeItem } from "@/lib/desk/visibility";
import { HOTELS } from "@/lib/pms";
import { CATEGORY_LABEL } from "@/lib/agent/schema";

const FLAG_AGE_MS = 2 * 3600000;
const FLAG_RULE = "Flagged when an item is older than 2 hours, or when an owner has 5 or more waiting and more than 1.5 times the desk average. Items are flagged, never people ranked.";

function ageMs(item: InboxItem, now: number) {
  return now - Date.parse(item.receivedAt);
}

function fmtAge(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

function Tile({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: "rose" | "green" }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-5 py-4">
      <div className="text-[11px] uppercase tracking-wide text-stone-500">{label}</div>
      <div className={`text-3xl font-semibold leading-tight mt-1 tabular-nums ${tone === "rose" ? "text-rose-700" : tone === "green" ? "text-emerald-800" : "text-stone-900"}`}>{value}</div>
      {hint ? <div className="text-xs text-stone-500 mt-1">{hint}</div> : null}
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

  const role = session.role;
  const leads = role === "senior" || role === "manager";

  // Same visibility rule as the desk: agents see their own numbers, seniors their team's, managers everything.
  const items = state.order.map((id) => state.items[id]).filter((i) => canSeeItem(session, i));
  const pending = items.filter(isPending);
  const todayStart = new Date(now).setHours(0, 0, 0, 0);
  const handledToday = items.filter((i) => i.handledAt && Date.parse(i.handledAt) >= todayStart);
  const replyMins = handledToday.map((i) => (Date.parse(i.handledAt!) - Date.parse(i.receivedAt)) / 60000).sort((a, b) => a - b);
  const median = replyMins.length ? Math.round(replyMins[Math.floor(replyMins.length / 2)]) : null;
  const oldest = pending.length ? Math.max(...pending.map((i) => ageMs(i, now))) : 0;

  // Promises kept, read from the simulated PMS trace status.
  const traces = state.traces;
  const traceDone = traces.filter((t) => t.status === "done").length;
  const traceAck = traces.filter((t) => t.status !== "open").length;
  const perHotel = HOTELS.map((h) => {
    const t = traces.filter((x) => x.hotelId === h.id);
    return { hotel: h, total: t.length, done: t.filter((x) => x.status === "done").length, ack: t.filter((x) => x.status !== "open").length };
  }).filter((x) => x.total);

  // Guardrails: one line, only when something is wrong.
  const unowned = pending.filter((i) => i.analysis && !i.ownerId).length;
  const cardSent = items.filter((i) => i.result?.sentReply && /\b(?:\d[ -]?){13,19}\b/.test(i.result.sentReply.body)).length;
  const stuck = pending.filter((i) => i.important.includes(NOBODY_TO_HAND_TO)).length;
  const alerts = [
    cardSent ? `${cardSent} reply with card digits went out` : null,
    unowned ? `${unowned} item${unowned === 1 ? "" : "s"} without an owner` : null,
    stuck ? `${stuck} conversation${stuck === 1 ? "" : "s"} stuck with someone off shift, nobody to hand to` : null,
  ].filter(Boolean) as string[];

  // Who is waiting on whom.
  const byOwner = new Map<string, InboxItem[]>();
  for (const i of pending) if (i.ownerId) byOwner.set(i.ownerId, [...(byOwner.get(i.ownerId) ?? []), i]);
  const humanOwners = [...byOwner.entries()].filter(([id]) => id !== AI_OWNER_ID);
  const avg = humanOwners.length ? humanOwners.reduce((s, [, l]) => s + l.length, 0) / humanOwners.length : 0;
  const flagged = (list: InboxItem[]) => list.some((i) => ageMs(i, now) > FLAG_AGE_MS) || (list.length >= 5 && list.length > 1.5 * avg);
  const people = ROSTER.filter((s) => isOnShift(s, new Date(now), state.shiftOverrides) || byOwner.has(s.id));
  const handoversToday = state.handovers.filter((h) => Date.parse(h.at) >= todayStart);
  const oldestList = [...pending].sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt)).slice(0, 6);

  return (
    <div className="mx-auto max-w-[1100px] w-full p-6 space-y-6">
      <div className="flex items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-stone-600">{role === "manager" ? "The whole desk, right now." : role === "senior" ? "You and the agents, right now." : "Your work, right now."}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {leads ? (
            <button
              onClick={() => dispatch({ type: "day_before_run", by: session.staffId })}
              className="text-xs px-3 py-1.5 rounded-md bg-brand text-white hover:bg-emerald-950"
              title="Sends the fixed day-before message to every booking arriving tomorrow; bookings with a request, a restricted trace or a VIP flag get a front-office call trace instead."
            >
              Run day-before check
            </button>
          ) : null}
          <span className="text-xs text-stone-500">
            {session.name} · {role}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Tile label="Waiting" value={pending.length} hint={pending.length ? `oldest ${fmtAge(oldest)}` : "nothing waiting"} tone={oldest > FLAG_AGE_MS ? "rose" : undefined} />
        <Tile label="Replied today" value={handledToday.length} hint={median !== null ? `median ${median} min from arrival to reply` : "none yet"} />
        <Tile
          label="Promises kept"
          value={traces.length ? `${traceDone} of ${traces.length}` : "–"}
          hint={traces.length ? `${Math.round((traceAck / traces.length) * 100)}% acknowledged by the hotels` : "no requests logged yet"}
          tone={traces.length && traceDone === traces.length ? "green" : undefined}
        />
      </div>

      {alerts.length ? (
        <p className="text-sm text-rose-700 font-medium" role="alert">
          {alerts.join(" · ")}
        </p>
      ) : null}

      {handoversToday.length ? (
        <Section title="Handovers today">
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

      {leads ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Section title="Who is waiting on whom">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="text-left font-medium py-1 pr-2">Owner</th>
                  <th className="text-right font-medium py-1 px-2">Waiting</th>
                  <th className="text-right font-medium py-1 pl-2">Oldest</th>
                </tr>
              </thead>
              <tbody>
                {people.map((s) => {
                  const list = byOwner.get(s.id) ?? [];
                  const mine = items.filter((i) => i.handledBy === s.id && i.handledAt && Date.parse(i.handledAt) >= todayStart);
                  const edited = mine.filter((i) => i.edited).length;
                  const corrected = items.filter((i) => i.handledBy === s.id && i.typeOverride).length;
                  const old = list.length ? Math.max(...list.map((i) => ageMs(i, now))) : 0;
                  const f = flagged(list);
                  return (
                    <tr key={s.id} className={`border-b border-stone-100 last:border-0 ${f ? "bg-rose-50/60" : ""}`}>
                      <td className="py-1.5" title={`${s.role} · replied today ${mine.length} · edited the suggested reply ${edited} · changed the type ${corrected}`}>
                        {ownerLabel(state, s.id)}
                        {f ? (
                          <span className="ml-2">
                            <Badge tone="rose" title={FLAG_RULE}>
                              flag
                            </Badge>
                          </span>
                        ) : null}
                      </td>
                      <td className="py-1.5 text-right px-2 tabular-nums">{list.length || ""}</td>
                      <td className={`py-1.5 text-right pl-2 text-xs tabular-nums ${old > FLAG_AGE_MS ? "text-rose-700 font-medium" : "text-stone-500"}`}>{list.length ? fmtAge(old) : ""}</td>
                    </tr>
                  );
                })}
                {byOwner.has(AI_OWNER_ID) ? (
                  <tr className="border-t border-stone-200">
                    <td className="py-1.5 text-stone-600">{ASSISTANT_NAME} (sent alone)</td>
                    <td className="py-1.5 text-right px-2 tabular-nums">{byOwner.get(AI_OWNER_ID)!.length}</td>
                    <td></td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </Section>

          <Section title="Oldest waiting">
            <ul className="text-sm space-y-1.5">
              {oldestList.map((i) => (
                <li key={i.message.id} className="flex items-center gap-2">
                  <span className={`text-xs tabular-nums ${ageMs(i, now) > FLAG_AGE_MS ? "text-rose-700 font-medium" : "text-stone-500"}`}>{timeAgo(i.receivedAt)}</span>
                  <span className="truncate">{i.message.fromName}</span>
                  <span className="text-xs text-stone-500 truncate">{i.analysis ? CATEGORY_LABEL[i.typeOverride ?? i.analysis.proposal.triage.category] : "sorting…"}</span>
                  <select
                    value={i.ownerId ?? ""}
                    onChange={(e) => dispatch({ type: "reassign", id: i.message.id, ownerId: e.target.value, by: session.staffId })}
                    className="ml-auto text-[11px] rounded border border-stone-300 bg-white px-1 py-0.5"
                    title="Reassign"
                  >
                    {!i.ownerId ? <option value="">Unassigned</option> : null}
                    {ROSTER.filter((s) => isOnShift(s, new Date(now), state.shiftOverrides) || s.id === i.ownerId).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
              {!pending.length ? <li className="text-stone-500">Nothing waiting.</li> : null}
            </ul>
          </Section>
        </div>
      ) : (
        <Section title="Your queue">
          <ul className="text-sm space-y-1.5">
            {oldestList.map((i) => (
              <li key={i.message.id} className="flex items-center gap-2">
                <span className={`text-xs tabular-nums ${ageMs(i, now) > FLAG_AGE_MS ? "text-rose-700 font-medium" : "text-stone-500"}`}>{timeAgo(i.receivedAt)}</span>
                <span className="truncate">{i.message.fromName}</span>
                <span className="text-xs text-stone-500 truncate">{i.analysis ? CATEGORY_LABEL[i.typeOverride ?? i.analysis.proposal.triage.category] : "sorting…"}</span>
              </li>
            ))}
            {!pending.length ? <li className="text-stone-500">Nothing waiting for you.</li> : null}
          </ul>
        </Section>
      )}

      {perHotel.length ? (
        <Section title="Promises kept per hotel">
          <table className="w-full text-sm">
            <tbody>
              {perHotel.map((x) => (
                <tr key={x.hotel.id} className="border-b border-stone-100 last:border-0">
                  <td className="py-1.5 font-medium">{x.hotel.name}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {x.done} of {x.total} done
                  </td>
                  <td className="py-1.5 text-right text-xs text-stone-500 tabular-nums">{Math.round((x.ack / x.total) * 100)}% acknowledged</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}
    </div>
  );
}
