"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStore, type InboxItem } from "@/lib/store";
import { Badge, Button, Section, fmtDate } from "@/components/ui";
import { CATEGORY_LABEL, HANDOFF_LABEL, type ProposedAction } from "@/lib/agent/schema";
import { DEPARTMENT_LABEL, getHotel, POLICIES } from "@/lib/pms";
import type { AnalysisResult } from "@/lib/agent";
import type { ExecutionResult } from "@/lib/agent/execute";

function ActionCard({ action, approved, onToggle, disabled }: { action: ProposedAction; approved: boolean; onToggle: () => void; disabled: boolean }) {
  const hotelName = (id: string) => getHotel(id)?.name ?? id;
  let title = "";
  let detail: React.ReactNode = null;
  let tone: "stone" | "green" | "amber" | "rose" | "blue" | "brand" = "stone";
  switch (action.type) {
    case "quote":
      title = `Quote · ${action.roomName} · ${action.ratePlan}`;
      tone = "blue";
      detail = (
        <>
          {hotelName(action.hotelId)} · {fmtDate(action.checkIn)} → {fmtDate(action.checkOut)} · {action.nights}n · <b>EUR {action.nightlyRate}/night</b> (EUR {action.total.toLocaleString("en-GB")} total) ·{" "}
          {action.refundable ? "refundable" : "non-refundable"} · {action.available ? "available" : "not available"}
        </>
      );
      break;
    case "modify_booking":
      title = `Modify booking ${action.bookingId}`;
      tone = action.withinPolicy ? "green" : "rose";
      detail = (
        <>
          {action.changes.checkIn ? `Check-in → ${fmtDate(action.changes.checkIn)}. ` : ""}
          {action.changes.checkOut ? `Check-out → ${fmtDate(action.changes.checkOut)}. ` : ""}
          {action.changes.roomType ? `Room → ${action.changes.roomType}. ` : ""}
          {action.newNightlyRate ? `New rate EUR ${action.newNightlyRate}/night. ` : ""}
          {typeof action.rateDifferenceTotal === "number" ? `Difference EUR ${action.rateDifferenceTotal}. ` : ""}
          {action.withinPolicy ? "Within policy." : "Outside policy: blocked."}
        </>
      );
      break;
    case "create_trace":
      title = `Trace → ${hotelName(action.hotelId)} · ${DEPARTMENT_LABEL[action.department]}`;
      tone = action.sensitive ? "rose" : "brand";
      detail = (
        <>
          {action.summary} <span className="text-stone-500">· due {fmtDate(action.due)}</span>
          {action.sensitive ? <span className="ml-1 text-rose-700">· restricted</span> : null}
        </>
      );
      break;
    case "handoff":
      title = `Hand off → ${HANDOFF_LABEL[action.to]} · ${action.urgency.replace("_", " ")}`;
      tone = "amber";
      detail = (
        <>
          {action.reason} <span className="text-stone-500">· {action.context}</span>
        </>
      );
      break;
    case "send_payment_link":
      title = "Send secure payment link";
      tone = "blue";
      detail = action.rationale;
      break;
  }
  return (
    <label className={`flex gap-3 rounded-md border p-3 text-sm cursor-pointer ${approved ? "border-stone-300 bg-white" : "border-stone-200 bg-stone-50 opacity-70"}`}>
      <input type="checkbox" checked={approved} onChange={onToggle} disabled={disabled} className="mt-1 accent-emerald-900" />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Badge tone={tone}>{action.type.replace("_", " ")}</Badge>
          <span className="font-medium">{title}</span>
        </div>
        <div className="mt-1 text-xs text-stone-700 leading-relaxed">{detail}</div>
        {"rationale" in action && action.type !== "send_payment_link" ? <div className="mt-1 text-[11px] text-stone-500 italic">Why: {action.rationale}</div> : null}
      </div>
    </label>
  );
}

export function ProposalPanel({ item }: { item: InboxItem }) {
  const { dispatch } = useStore();
  const [busy, setBusy] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const id = item.message.id;
  const analysis = item.analysis;
  const p = analysis?.proposal;
  const done = item.status === "sent" || item.status === "handed_off";
  const requested = useRef<string | null>(null);

  const analyze = useCallback(
    async (engine?: "claude" | "rules") => {
      dispatch({ type: "analyzing", id });
      try {
        const r = await fetch("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: item.message, engine }),
        });
        if (!r.ok) throw new Error(`Analyse failed (${r.status})`);
        const data = (await r.json()) as AnalysisResult;
        dispatch({ type: "analyzed", id, analysis: data });
      } catch (e) {
        dispatch({ type: "analyze_failed", id, error: e instanceof Error ? e.message : String(e) });
      }
    },
    [dispatch, id, item.message],
  );

  // Auto-analyse when a new item is opened.
  useEffect(() => {
    if (item.status === "new" && !item.error && requested.current !== id) {
      requested.current = id;
      void analyze();
    }
  }, [item.status, item.error, id, analyze]);

  const executeNow = async (sendReply: boolean) => {
    if (!p) return;
    setBusy(true);
    try {
      const approvedActionIndexes = (item.approved ?? []).map((a, i) => (a ? i : -1)).filter((i) => i >= 0);
      const r = await fetch("/api/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: item.message, proposal: p, approvedActionIndexes, draftReply: item.draft ?? p.draftReply, sendReply }),
      });
      const result = (await r.json()) as ExecutionResult;
      dispatch({ type: "executed", id, result, status: sendReply ? "sent" : "handed_off" });
    } finally {
      setBusy(false);
    }
  };

  if (item.status === "analyzing" || (!p && !item.error)) {
    return (
      <div className="rounded-lg border border-stone-200 bg-white p-6 text-sm text-stone-600 flex items-center gap-3">
        <span className="h-4 w-4 rounded-full border-2 border-stone-300 border-t-brand animate-spin" />
        Reading the message, matching the booking, checking rates and policies…
      </div>
    );
  }
  if (!p) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm">
        <div className="font-medium text-rose-900">Could not analyse this message.</div>
        <div className="text-rose-800 text-xs mt-1">{item.error}</div>
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={() => analyze()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const hotel = p.triage.hotelId ? getHotel(p.triage.hotelId) : undefined;
  const handoff = p.actions.find((a) => a.type === "handoff");
  const approvedCount = (item.approved ?? []).filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Triage */}
      <Section
        title="Copilot read"
        right={
          <span className="text-[11px] text-stone-500">
            {analysis?.engine === "claude" ? `${analysis.model} · ${(analysis.latencyMs / 1000).toFixed(1)}s` : `rules engine · ${analysis?.latencyMs ?? 0}ms`}
            {analysis?.fallbackError ? <span className="text-rose-700"> · live model failed, fell back</span> : null}
          </span>
        }
      >
        <div className="flex flex-wrap gap-1.5 mb-2">
          <Badge tone="brand">{CATEGORY_LABEL[p.triage.category]}</Badge>
          {p.triage.secondaryCategories.map((c) => (
            <Badge key={c}>{CATEGORY_LABEL[c]}</Badge>
          ))}
          {hotel ? <Badge>{hotel.name}</Badge> : <Badge tone="amber">Hotel unknown</Badge>}
          <Badge tone={p.triage.urgency === "high" ? "rose" : p.triage.urgency === "low" ? "stone" : "blue"}>{p.triage.urgency} urgency</Badge>
          <Badge tone={p.confidence >= 0.75 ? "green" : "amber"}>confidence {Math.round(p.confidence * 100)}%</Badge>
          {p.autoSendEligible ? <Badge tone="green" title="Pure FAQ answered from policy. Candidate for auto-send in phase 2; still human-approved in v1.">auto-send eligible (phase 2)</Badge> : null}
        </div>
        <p className="text-sm text-stone-800">{p.triage.summary}</p>
        <p className="mt-1 text-xs text-stone-500">
          Booking: {p.bookingMatch.bookingId ? <span className="font-mono">{p.bookingMatch.bookingId}</span> : "none"} · {p.bookingMatch.confidence} confidence · {p.bookingMatch.note}
        </p>
        {analysis?.toolCalls?.length ? (
          <div className="mt-2">
            <button onClick={() => setShowTools((s) => !s)} className="text-xs text-brand hover:underline">
              {showTools ? "Hide" : "Show"} {analysis.toolCalls.length} PMS lookups the model made
            </button>
            {showTools ? (
              <ul className="mt-1 space-y-1 text-[11px] font-mono text-stone-600 bg-stone-50 rounded p-2 max-h-48 overflow-auto scroll-thin">
                {analysis.toolCalls.map((t, i) => (
                  <li key={i}>
                    <span className="text-stone-900">{t.name}</span>({JSON.stringify(t.input)}) → {t.result}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </Section>

      {/* Sensitive data */}
      {p.sensitiveData.present ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm">
          <div className="font-medium text-rose-900">Sensitive data: {p.sensitiveData.types.join(", ").replaceAll("_", " ")}</div>
          <div className="text-xs text-rose-800 mt-1">{p.sensitiveData.handling}</div>
        </div>
      ) : null}

      {/* Actions */}
      <Section title={`Proposed actions · ${approvedCount}/${p.actions.length} approved`}>
        {p.actions.length ? (
          <div className="space-y-2">
            {p.actions.map((a, i) => (
              <ActionCard key={i} action={a} approved={item.approved?.[i] ?? true} onToggle={() => dispatch({ type: "toggle_action", id, index: i })} disabled={done} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-stone-500">No PMS actions. The reply answers the question directly from policy.</p>
        )}
        {p.didNotPromise.length ? (
          <div className="mt-3 text-xs text-stone-600">
            <div className="font-medium text-stone-700 mb-1">Deliberately not promised</div>
            <ul className="list-disc pl-4 space-y-0.5">
              {p.didNotPromise.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {p.policyCitations.length ? (
          <div className="mt-3 flex flex-wrap gap-1">
            {p.policyCitations.map((c) => {
              const pol = POLICIES.find((x) => x.id === c);
              return (
                <Badge key={c} title={pol?.text}>
                  {pol?.topic ?? c}
                </Badge>
              );
            })}
          </div>
        ) : null}
      </Section>

      {/* Draft */}
      <Section
        title="Draft reply"
        right={
          !done ? (
            <button onClick={() => dispatch({ type: "set_draft", id, draft: p.draftReply })} className="text-xs text-stone-500 hover:underline">
              Reset to copilot draft
            </button>
          ) : null
        }
      >
        <textarea
          value={item.draft ?? p.draftReply}
          onChange={(e) => dispatch({ type: "set_draft", id, draft: e.target.value })}
          disabled={done}
          rows={8}
          className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm leading-relaxed disabled:bg-stone-50 disabled:text-stone-600"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!done ? (
            <>
              <Button onClick={() => executeNow(true)} disabled={busy}>
                {busy ? "Sending…" : `Approve & send${approvedCount ? ` (${approvedCount} action${approvedCount === 1 ? "" : "s"})` : ""}`}
              </Button>
              <Button variant="secondary" onClick={() => executeNow(false)} disabled={busy}>
                {handoff ? `Hand off only, no reply` : "Log actions, no reply"}
              </Button>
              <span className="ml-auto text-[11px] text-stone-500 max-w-[320px] text-right">{p.requiresHumanReason}</span>
            </>
          ) : (
            <div className="text-xs text-stone-600 space-y-1">
              <div className="font-medium text-stone-800">{item.status === "sent" ? "Reply sent." : "Handed off without a reply."}</div>
              {item.result?.traces.length ? <div>{item.result.traces.length} trace(s) created in the PMS. See Hotel traces.</div> : null}
              {item.result?.bookingUpdates.length ? <div>Booking {item.result.bookingUpdates.map((b) => b.id).join(", ")} modified.</div> : null}
              {item.result?.handoffs.length ? <div>Handed off to {item.result.handoffs.map((h) => HANDOFF_LABEL[h.to as keyof typeof HANDOFF_LABEL] ?? h.to).join(", ")}.</div> : null}
              {item.result?.skipped.length ? <div className="text-rose-700">{item.result.skipped.length} action(s) skipped: {item.result.skipped.map((s) => s.reason).join("; ")}</div> : null}
            </div>
          )}
        </div>
      </Section>

      {!done ? (
        <div className="flex gap-2 text-xs text-stone-500">
          <button onClick={() => analyze("rules")} className="hover:underline">
            Re-run with rules engine
          </button>
          <span>·</span>
          <button onClick={() => analyze("claude")} className="hover:underline">
            Re-run with live model
          </button>
        </div>
      ) : null}
    </div>
  );
}
