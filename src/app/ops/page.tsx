"use client";

import { useStore } from "@/lib/store";
import { Badge, Button, fmtDate } from "@/components/ui";
import { DEPARTMENT_LABEL, HOTELS, type Trace } from "@/lib/pms";
import { HANDOFF_LABEL } from "@/lib/agent/schema";

function TraceRow({ t, onStatus }: { t: Trace; onStatus: (s: Trace["status"]) => void }) {
  return (
    <li className={`rounded-md border p-3 text-sm ${t.status === "done" ? "border-stone-200 bg-stone-50 opacity-70" : t.sensitive ? "border-rose-200 bg-rose-50/40" : "border-stone-200 bg-white"}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone="brand">{DEPARTMENT_LABEL[t.department]}</Badge>
        <span className="text-xs text-stone-500">due {fmtDate(t.due)}</span>
        {t.bookingId ? <span className="font-mono text-xs text-stone-500">{t.bookingId}</span> : null}
        {t.sensitive ? <Badge tone="rose" title="Restricted: special category data. Visible to the owning department only.">restricted</Badge> : null}
        <span className="ml-auto flex gap-1">
          {t.status === "open" ? (
            <Button size="sm" variant="secondary" onClick={() => onStatus("acknowledged")}>
              Acknowledge
            </Button>
          ) : null}
          {t.status !== "done" ? (
            <Button size="sm" onClick={() => onStatus("done")}>
              Mark done
            </Button>
          ) : (
            <Badge tone="green">done</Badge>
          )}
        </span>
      </div>
      <p className="mt-1.5 text-stone-800">{t.summary}</p>
      <div className="mt-1 text-[11px] text-stone-500">
        {t.status} · created {new Date(t.createdAt).toLocaleString("en-GB")} · source {t.source}
      </div>
    </li>
  );
}

export default function Ops() {
  const { state, dispatch } = useStore();
  if (!state.hydrated) return <div className="p-6 text-sm text-stone-500">Loading…</div>;

  const byHotel = HOTELS.map((h) => ({ hotel: h, traces: state.traces.filter((t) => t.hotelId === h.id) })).filter((x) => x.traces.length);
  const open = state.traces.filter((t) => t.status !== "done").length;

  return (
    <div className="mx-auto max-w-[1100px] w-full p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Hotel traces</h1>
        <p className="text-sm text-stone-600 mt-1 max-w-2xl">
          What the hotel teams see. Every special request approved on the desk lands here as a PMS trace with an owner, a due date and a restricted flag where needed, instead of a line in the free-text notes field read on the day of arrival.
        </p>
        <div className="mt-3 flex gap-2 text-xs">
          <Badge tone={open ? "amber" : "green"}>{open} open</Badge>
          <Badge>{state.traces.length} total</Badge>
          <Badge tone="rose">{state.traces.filter((t) => t.sensitive).length} restricted</Badge>
        </div>
      </div>

      {byHotel.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">
          No traces yet. Approve a reply on the Desk that includes a special request and it will appear here.
        </div>
      ) : (
        byHotel.map(({ hotel, traces }) => (
          <section key={hotel.id} className="space-y-2">
            <h2 className="font-medium flex items-center gap-2">
              {hotel.name} <span className="text-xs text-stone-500 font-normal">{hotel.city} · {hotel.kind}</span>
              <Badge>{traces.filter((t) => t.status !== "done").length} open</Badge>
            </h2>
            <ul className="space-y-2">
              {[...traces]
                .sort((a, b) => a.due.localeCompare(b.due))
                .map((t) => (
                  <TraceRow key={t.id} t={t} onStatus={(s) => dispatch({ type: "trace_status", traceId: t.id, status: s })} />
                ))}
            </ul>
          </section>
        ))
      )}

      {state.handoffs.length ? (
        <section className="space-y-2">
          <h2 className="font-medium">Handoffs to people</h2>
          <ul className="space-y-2">
            {state.handoffs.map((h) => (
              <li key={h.id} className="rounded-md border border-amber-200 bg-amber-50/40 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge tone="amber">{HANDOFF_LABEL[h.to as keyof typeof HANDOFF_LABEL] ?? h.to}</Badge>
                  <span className="text-xs text-stone-500">{h.urgency.replace("_", " ")}</span>
                  <span className="ml-auto text-[11px] text-stone-500">from {h.messageId}</span>
                </div>
                <p className="mt-1 text-stone-800">{h.reason}</p>
                <p className="mt-0.5 text-xs text-stone-600">{h.context}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {state.bookingUpdates.length ? (
        <section className="space-y-2">
          <h2 className="font-medium">Bookings modified</h2>
          <ul className="space-y-1 text-sm">
            {state.bookingUpdates.map((b, i) => (
              <li key={i} className="rounded-md border border-stone-200 bg-white p-3">
                <span className="font-mono text-xs">{b.id}</span> · {fmtDate(b.checkIn)} → {fmtDate(b.checkOut)} · {b.roomType} · EUR {b.nightlyRate}/night · {b.status}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
