"use client";

import { useState } from "react";
import { useStore, type InboxItem } from "@/lib/store";
import { fmtDate } from "@/components/ui";
import { HANDOFF_LABEL, type ProposedAction } from "@/lib/agent/schema";
import { DEPARTMENT_LABEL, getBooking, getGuest, getHotel, nightsBetween, POLICIES } from "@/lib/pms";
import { AI_OWNER_ID, ASSISTANT_NAME } from "@/lib/desk/roster";
import type { Conversation } from "@/lib/desk/visibility";

function actionLine(a: ProposedAction): { title: string; detail?: string; why?: string; restricted?: boolean; blocked?: boolean } {
  const hotelName = (id: string) => getHotel(id)?.name ?? id;
  switch (a.type) {
    case "quote":
      return {
        title: `Quote ${a.roomName}, ${a.ratePlan}`,
        detail: `${fmtDate(a.checkIn)} to ${fmtDate(a.checkOut)} · EUR ${a.nightlyRate}/night, EUR ${a.total.toLocaleString("en-GB")} total · ${a.refundable ? "refundable" : "non-refundable"}${a.available ? "" : " · not available"}`,
        why: a.rationale,
      };
    case "modify_booking": {
      const parts = [
        a.changes.checkIn ? `check-in to ${fmtDate(a.changes.checkIn)}` : "",
        a.changes.checkOut ? `check-out to ${fmtDate(a.changes.checkOut)}` : "",
        a.changes.roomType ? `room to ${a.changes.roomType}` : "",
        a.newNightlyRate ? `new rate EUR ${a.newNightlyRate}/night` : "",
        typeof a.rateDifferenceTotal === "number" ? `difference EUR ${a.rateDifferenceTotal}` : "",
      ].filter(Boolean);
      return { title: `Change booking ${a.bookingId}`, detail: `${parts.join(" · ")}${a.withinPolicy ? " · within the rules" : " · outside the rules, blocked"}`, why: a.rationale, blocked: !a.withinPolicy };
    }
    case "create_trace":
      return { title: `Trace to ${hotelName(a.hotelId).replace(/^Aurel /, "")} ${DEPARTMENT_LABEL[a.department]}`, detail: `${a.summary} · due ${fmtDate(a.due)}`, why: a.rationale, restricted: a.sensitive };
    case "handoff":
      return { title: `Hand to ${HANDOFF_LABEL[a.to]} · ${a.urgency.replace("_", " ")}`, detail: a.reason, why: a.context };
    case "send_payment_link":
      return { title: "Send a secure payment link", detail: a.rationale };
  }
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-4 py-4 border-b border-stone-100">
      <div className="text-[11px] uppercase tracking-wide text-stone-400 mb-2">{title}</div>
      {children}
    </section>
  );
}

export function ContextPanel({ conversation, variant = "inline", onClose }: { conversation: Conversation; variant?: "inline" | "sheet"; onClose?: () => void }) {
  const { state, dispatch } = useStore();
  const session = state.session;
  const [showLookups, setShowLookups] = useState(false);
  const head: InboxItem = conversation.open ?? conversation.latest;
  const analysis = head.analysis;
  const p = analysis?.proposal;
  const open = conversation.open;
  const canOverride = session?.role === "senior" || session?.role === "manager";
  const canAct = session?.staffId === head.ownerId || canOverride;
  const bookingId = p?.bookingMatch.bookingId ?? head.message.bookingRef ?? null;
  const booking = bookingId ? getBooking(bookingId) : undefined;
  const hotel = booking ? getHotel(booking.hotelId) : p?.triage.hotelId ? getHotel(p.triage.hotelId) : undefined;
  const guest = booking ? getGuest(booking.guestId) : undefined;
  const updated = head.result?.bookingUpdates.find((b) => b.id === bookingId);
  const checkIn = updated?.checkIn ?? booking?.checkIn;
  const checkOut = updated?.checkOut ?? booking?.checkOut;
  const room = booking ? hotel?.roomTypes.find((r) => r.code === (updated?.roomType ?? booking.roomType))?.name : undefined;

  return (
    <aside
      aria-label="Booking and actions"
      className={
        variant === "sheet"
          ? "fixed inset-y-0 right-0 w-[340px] max-w-[90vw] z-30 bg-white border-l border-stone-200 shadow-2xl overflow-y-auto scroll-thin text-sm"
          : "w-[300px] shrink-0 border-l border-stone-200 bg-white overflow-y-auto scroll-thin text-sm"
      }
    >
      {variant === "sheet" ? (
        <div className="px-4 h-12 flex items-center border-b border-stone-100 sticky top-0 bg-white">
          <span className="text-sm font-semibold">Details</span>
          <button onClick={onClose} aria-label="Close details" className="ml-auto h-7 w-7 grid place-items-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-900 text-lg leading-none">
            ×
          </button>
        </div>
      ) : null}
      <Block title="Booking">
        {booking && hotel && checkIn && checkOut ? (
          <div className="space-y-0.5">
            <div className="font-medium">{booking.id}</div>
            <div className="text-stone-700">{hotel.name}</div>
            <div className="text-stone-700">
              {fmtDate(checkIn)} to {fmtDate(checkOut)} · {nightsBetween(checkIn, checkOut)} nights
            </div>
            <div className="text-stone-700">
              {room} · {booking.adults + booking.children} guests
            </div>
            <div className="text-xs text-stone-500">
              {booking.ratePlan} · EUR {updated?.nightlyRate ?? booking.nightlyRate}/night · {booking.channel.replace("_", " ")} · {updated ? "changed just now" : booking.status}
            </div>
          </div>
        ) : (
          <div className="text-stone-500 text-[13px]">{p ? `No booking matched. ${p.bookingMatch.note}` : "Not sorted yet."}</div>
        )}
      </Block>

      <Block title="Guest">
        <div className="font-medium">{head.message.fromName}</div>
        <div className="text-xs text-stone-500 break-all">{head.message.from}</div>
        {guest ? (
          <div className="text-xs text-stone-600 mt-1">
            {guest.vip ? `VIP · ${guest.stays} stays` : `${guest.stays} stay${guest.stays === 1 ? "" : "s"}`}
            {guest.preferences.length ? ` · prefers ${guest.preferences.join(", ")}` : ""}
          </div>
        ) : null}
        {conversation.items.length > 1 ? <div className="text-xs text-stone-500 mt-1">{conversation.items.length} messages in this thread</div> : null}
      </Block>

      {p ? (
        <Block title="What Aurel Assistant read">
          <p className="text-[13px] text-stone-700">{p.triage.summary}</p>
        </Block>
      ) : null}

      {p && open && head.status !== "auto_sent" ? (
        <Block title={p.actions.length ? "When you approve" : "Nothing else happens"}>
          {p.actions.length ? (
            <ul className="space-y-2">
              {p.actions.map((a, i) => {
                const line = actionLine(a);
                const on = open.approved?.[i] ?? true;
                return (
                  <li key={i} className={`flex gap-2 ${on ? "" : "opacity-50"}`}>
                    <input type="checkbox" checked={on} disabled={!canAct} onChange={() => dispatch({ type: "toggle_action", id: open.message.id, index: i })} className="mt-1 accent-emerald-900 shrink-0" title={line.why} />
                    <div className="min-w-0">
                      <div className={`text-[13px] font-medium ${line.blocked ? "text-rose-700" : "text-stone-900"}`}>
                        {line.title}
                        {line.restricted ? <span className="ml-1.5 text-[11px] font-normal text-rose-700 whitespace-nowrap">restricted</span> : null}
                      </div>
                      {line.detail ? <div className="text-xs text-stone-600 mt-0.5">{line.detail}</div> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[13px] text-stone-500">The reply answers directly{p.policyCitations.length ? " from the handbook" : ""}; nothing is written to the PMS.</p>
          )}
        </Block>
      ) : null}

      {p && !open && head.result ? (
        <Block title="What was done">
          <ul className="space-y-1 text-[13px] text-stone-700">
            {head.result.traces.map((t) => (
              <li key={t.id}>Trace to {DEPARTMENT_LABEL[t.department]} · {t.status}</li>
            ))}
            {head.result.bookingUpdates.map((b) => (
              <li key={b.id}>Booking {b.id} changed</li>
            ))}
            {head.result.handoffs.map((h) => (
              <li key={h.id}>Handed to {HANDOFF_LABEL[h.to as keyof typeof HANDOFF_LABEL] ?? h.to}</li>
            ))}
            {!head.result.traces.length && !head.result.bookingUpdates.length && !head.result.handoffs.length ? <li className="text-stone-500">Reply only.</li> : null}
          </ul>
        </Block>
      ) : null}

      {p?.sensitiveData.present ? (
        <Block title="Sensitive">
          <p className="text-[13px] text-rose-800">
            <span className="font-medium">{p.sensitiveData.types.join(", ").replaceAll("_", " ")}.</span> {p.sensitiveData.handling}
          </p>
        </Block>
      ) : null}

      {p?.didNotPromise.length ? (
        <Block title="Not promised">
          <ul className="list-disc pl-4 space-y-0.5 text-[13px] text-stone-700">
            {p.didNotPromise.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </Block>
      ) : null}

      {p?.policyCitations.length ? (
        <Block title="Based on">
          <ul className="space-y-0.5 text-[13px]">
            {p.policyCitations.map((c) => {
              const pol = POLICIES.find((x) => x.id === c);
              return (
                <li key={c} title={pol ? `${pol.source ?? pol.id}\n\n${pol.text}` : c} className="text-stone-700 underline decoration-dotted underline-offset-2 cursor-help">
                  {pol?.topic ?? c}
                  {pol && pol.hotelId !== "all" ? <span className="text-stone-400 no-underline"> · {getHotel(pol.hotelId)?.name.replace(/^Aurel /, "")}</span> : null}
                </li>
              );
            })}
          </ul>
        </Block>
      ) : null}

      {p && analysis ? (
        <section className="px-4 py-4 text-[11px] text-stone-400 leading-relaxed">
          <span title={analysis.engine === "gemini" ? `Language model: ${analysis.model}` : analysis.fallbackError ? `Model unavailable: ${analysis.fallbackError}` : "Deterministic rules engine"}>
            Sorted by {analysis.engine === "gemini" ? ASSISTANT_NAME : analysis.fallbackError ? "the rules engine (model unavailable)" : "the rules engine"}
          </span>
          {" "}· confidence {Math.round(p.confidence * 100)}%
          {head.ownerId === AI_OWNER_ID ? "" : ` · ${head.ownerRule?.toLowerCase() ?? ""}`}
          {analysis.toolCalls?.length ? (
            <>
              {" · "}
              <button onClick={() => setShowLookups((s) => !s)} className="hover:underline">
                {showLookups ? "hide" : "show"} {analysis.toolCalls.length} PMS lookups
              </button>
            </>
          ) : null}
          {showLookups && analysis.toolCalls?.length ? (
            <ul className="mt-1 space-y-1 font-mono text-stone-600 bg-stone-50 rounded p-2 max-h-48 overflow-auto scroll-thin">
              {analysis.toolCalls.map((t, i) => (
                <li key={i}>
                  <span className="text-stone-900">{t.name}</span>({JSON.stringify(t.input)}) → {t.result}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </aside>
  );
}
