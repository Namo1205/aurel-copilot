"use client";

import { useEffect, useRef, useState } from "react";
import { useStore, type InboxItem } from "@/lib/store";
import { Button, CHANNEL_LABEL, ChannelIcon, timeAgo } from "@/components/ui";
import { CATEGORY_LABEL, type Category } from "@/lib/agent/schema";
import { getHotel } from "@/lib/pms";
import { redactCards } from "@/lib/agent/rules";
import type { AnalysisResult } from "@/lib/agent";
import type { ExecutionResult } from "@/lib/agent/execute";
import { CATEGORY_ORDER, ROSTER, isOnShift, ownerName } from "@/lib/desk/roster";
import type { Conversation } from "@/lib/desk/visibility";

export function ago(iso: string): string {
  const t = timeAgo(iso);
  return t === "just now" ? "just now" : `${t} ago`;
}

const AUTO_SEND_LABEL: Record<string, string> = {
  policy_answer: "policy answer, sent alone",
  holding_reply: "holding reply, sent alone",
  group_ack: "group acknowledgement, sent alone",
  off_topic_decline: "decline, sent alone",
};

function Bubble({ side, who, when, children, tone = "plain" }: { side: "guest" | "us"; who: string; when: string; children: React.ReactNode; tone?: "plain" | "ai" | "failed" }) {
  const guest = side === "guest";
  return (
    <div className={`flex ${guest ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[78%] ${guest ? "" : "text-right"}`}>
        <div className={`text-[11px] text-stone-400 mb-1 ${guest ? "" : ""}`}>
          {who} · {when}
        </div>
        <div
          className={`inline-block text-left rounded-2xl px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap ${
            guest ? "bg-white border border-stone-200 text-stone-800 rounded-tl-md" : tone === "failed" ? "bg-rose-50 border border-rose-200 text-stone-800 rounded-tr-md" : tone === "ai" ? "bg-emerald-50 border border-emerald-100 text-stone-800 rounded-tr-md" : "bg-brand text-white rounded-tr-md"
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// When Gmail could not deliver a reply, a person sends it again, edited if they like.
// Only the email is resent; PMS actions that already ran are not repeated.
export function ResendBox({ item, body, error }: { item: InboxItem; body: string; error: string }) {
  const { state, dispatch } = useStore();
  const [text, setText] = useState(body);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!state.session) return;
    setBusy(true);
    try {
      const r = await fetch("/api/gmail/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: item.message, body: text }) });
      const j = (await r.json()) as { ok: boolean; at?: string; error?: string };
      dispatch({ type: "resend_result", id: item.message.id, ok: j.ok, body: text, at: j.at ?? new Date().toISOString(), by: state.session.staffId, error: j.ok ? undefined : (j.error ?? `HTTP ${r.status}`) });
    } catch (e) {
      dispatch({ type: "resend_result", id: item.message.id, ok: false, body: text, at: new Date().toISOString(), by: state.session.staffId, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-left">
      <p className="text-sm text-rose-800">
        <span className="font-medium">The guest has not received this.</span> Gmail could not send it: {error}
      </p>
      <p className="text-xs text-stone-600 mt-1">Check the text, change it if you want, and send it yourself. Nothing else is re-run.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="mt-2 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand/30" />
      <div className="mt-2 flex items-center gap-2">
        <Button onClick={send} disabled={busy || !text.trim()} size="sm">
          {busy ? "Sending…" : "Send again"}
        </Button>
        <span className="text-xs text-stone-500">to {item.message.from}</span>
      </div>
    </div>
  );
}

// One inbound message and everything we sent back for it.
function Exchange({ item }: { item: InboxItem }) {
  const m = item.message;
  const p = item.analysis?.proposal;
  const body = redactCards(m.body);
  return (
    <>
      <Bubble side="guest" who={m.fromName} when={ago(item.receivedAt)}>
        {m.subject ? <div className="font-medium mb-1">{m.subject}</div> : null}
        {body}
      </Bubble>
      {item.autoSentAt && item.autoSentBody ? (
        <div className="flex justify-end">
          <div className="max-w-[78%]">
            <div className="text-[11px] text-stone-400 mb-1 text-right">
              AI agent · {p ? AUTO_SEND_LABEL[p.autoSend.kind] ?? "sent alone" : "sent alone"} · {ago(item.autoSentAt)}
              {item.message.gmail ? (item.delivery ? (item.delivery.error ? <span className="text-rose-700"> · not delivered</span> : " · delivered") : " · sending…") : null}
            </div>
            {item.delivery?.error ? (
              <ResendBox item={item} body={item.autoSentBody} error={item.delivery.error} />
            ) : (
              <div className="inline-block text-left rounded-2xl rounded-tr-md px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap bg-emerald-50 border border-emerald-100 text-stone-800">{item.autoSentBody}</div>
            )}
          </div>
        </div>
      ) : null}
      {item.result?.sentReply ? (
        <div className="flex justify-end">
          <div className="max-w-[78%]">
            <div className="text-[11px] text-stone-400 mb-1 text-right">
              {ownerName(item.handledBy ?? null)} · {ago(item.result.sentReply.sentAt)}
              {item.edited ? " · edited the draft" : " · AI draft as written"}
              {item.result.sentReply.deliveredVia === "gmail" ? " · delivered" : item.result.sentReply.deliveryError ? <span className="text-rose-700"> · not delivered</span> : null}
            </div>
            {item.result.sentReply.deliveryError ? (
              <ResendBox item={item} body={item.result.sentReply.body} error={item.result.sentReply.deliveryError} />
            ) : (
              <div className="inline-block text-left rounded-2xl rounded-tr-md px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap bg-brand text-white">{item.result.sentReply.body}</div>
            )}
          </div>
        </div>
      ) : null}
      {item.status === "handed_off" ? <div className="text-center text-[11px] text-stone-400">Closed without a reply by {ownerName(item.handledBy ?? null)} · {item.handledAt ? ago(item.handledAt) : ""}</div> : null}
    </>
  );
}

export function Thread({ conversation }: { conversation: Conversation }) {
  const { state, dispatch } = useStore();
  const session = state.session;
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => new Date());
  const [manualText, setManualText] = useState("");
  const [replyMode, setReplyMode] = useState<"ai" | "manual">("ai");
  const scrollRef = useRef<HTMLDivElement>(null);

  const sendManualReply = async (textToSend: string, targetId: string) => {
    if (!textToSend.trim() || !session) return;
    setBusy(true);
    try {
      let delivery: { via: "gmail"; at: string; error?: string } | undefined;
      if (m.gmail) {
        try {
          const r = await fetch("/api/gmail/send", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: m, body: textToSend }),
          });
          const j = (await r.json()) as { ok: boolean; at?: string; error?: string };
          delivery = {
            via: "gmail",
            at: j.at ?? new Date().toISOString(),
            error: j.ok ? undefined : (j.error ?? `HTTP ${r.status}`),
          };
        } catch (err) {
          delivery = {
            via: "gmail",
            at: new Date().toISOString(),
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }
      dispatch({
        type: "manual_reply",
        id: targetId,
        body: textToSend,
        by: session.staffId,
        delivery,
      });
      setManualText("");
    } finally {
      setBusy(false);
    }
  };
  const open = conversation.open;
  const head = open ?? conversation.latest;
  const m = head.message;
  const p = head.analysis?.proposal;
  const id = head.message.id;
  const canOverride = session?.role === "senior" || session?.role === "manager";
  const isOwner = session?.staffId === head.ownerId;
  const canAct = isOwner || canOverride;
  const hotel = p?.triage.hotelId ? getHotel(p.triage.hotelId) : undefined;
  const category = head.typeOverride ?? p?.triage.category;
  const approvedCount = (head.approved ?? []).filter(Boolean).length;
  const handoff = p?.actions.find((a) => a.type === "handoff");
  const sorting = open ? open.status === "new" || open.status === "analyzing" : false;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [conversation.key, conversation.items.length, head.status]);

  const rerun = async () => {
    dispatch({ type: "analyzing", id });
    try {
      const r = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: m }) });
      if (!r.ok) throw new Error(`Sorting failed (${r.status})`);
      dispatch({ type: "analyzed", id, analysis: (await r.json()) as AnalysisResult });
    } catch (e) {
      dispatch({ type: "analyze_failed", id, error: e instanceof Error ? e.message : String(e) });
    }
  };

  const executeNow = async (sendReply: boolean) => {
    if (!p || !session || !open) return;
    setBusy(true);
    try {
      const approvedActionIndexes = (open.approved ?? []).map((a, i) => (a ? i : -1)).filter((i) => i >= 0);
      const r = await fetch("/api/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: m, proposal: p, approvedActionIndexes, draftReply: open.draft ?? p.draftReply, sendReply }),
      });
      const result = (await r.json()) as ExecutionResult;
      dispatch({ type: "executed", id, result, status: sendReply ? "sent" : "handed_off", by: session.staffId });
    } finally {
      setBusy(false);
    }
  };

  const ownerTitle = [head.ownerRule ?? "", ...(head.ownerHistory ?? []).map((h) => `${h.from ? ownerName(h.from) + " → " : ""}${ownerName(h.to)} · ${new Date(h.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · ${h.reason}`)].filter(Boolean).join("\n");

  return (
    <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-[#f6f4ef]">
      {/* Header */}
      <header className="px-5 h-14 border-b border-stone-200 bg-white flex items-center gap-3 shrink-0">
        <ChannelIcon channel={m.channel} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h1 className="font-semibold tracking-tight truncate">{m.fromName}</h1>
            <span className="text-xs text-stone-500 truncate">
              {CHANNEL_LABEL[m.channel]} · {m.from}
              {m.gmail ? " · live" : ""}
            </span>
          </div>
          <div className="flex items-center gap-x-2 text-[13px] text-stone-600 truncate">
            {p && category ? (
              <span className={`relative inline-flex items-center gap-1 font-medium -ml-1 px-1 rounded ${!open || !canAct ? "" : "hover:bg-stone-100"}`} title="Change the type if the AI agent sorted it wrong. Counted as a correction.">
                {CATEGORY_LABEL[category]}
                {!open || !canAct ? null : <span className="text-stone-400 text-xs">▾</span>}
                {!open || !canAct ? null : (
                  <select value={category} onChange={(e) => dispatch({ type: "override_type", id, category: e.target.value as Category })} className="absolute inset-0 opacity-0 cursor-pointer">
                    {CATEGORY_ORDER.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABEL[c]}
                      </option>
                    ))}
                  </select>
                )}
              </span>
            ) : (
              <span className="text-stone-400">Sorting…</span>
            )}
            {head.typeOverride && p && head.typeOverride !== p.triage.category ? <span className="text-xs text-amber-700">corrected from {CATEGORY_LABEL[p.triage.category]}</span> : null}
            {hotel ? <span>· {hotel.name}</span> : null}
            {p?.triage.urgency === "high" ? <span className="text-rose-700">· urgent</span> : null}
            {open?.important.length ? <span className="text-rose-700 truncate">· {open.important.join("; ").toLowerCase()}</span> : null}
          </div>
        </div>
        <div className="text-right text-sm shrink-0">
          <div className="text-[11px] text-stone-400">Owner</div>
          {canOverride && open ? (
            <span className="relative inline-flex items-center gap-1 font-medium px-1 -mr-1 rounded hover:bg-stone-100" title={`${ownerTitle}\nClick to reassign.`}>
              {ownerName(head.ownerId)}
              {isOwner ? <span className="text-stone-400 font-normal">(you)</span> : null}
              <span className="text-stone-400 text-xs">▾</span>
              <select value={head.ownerId ?? ""} onChange={(e) => dispatch({ type: "reassign", id, ownerId: e.target.value, by: session?.staffId })} className="absolute inset-0 opacity-0 cursor-pointer">
                {ROSTER.filter((s) => isOnShift(s, now, state.shiftOverrides) || s.id === head.ownerId).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </span>
          ) : (
            <div className="font-medium" title={ownerTitle}>
              {ownerName(head.ownerId)}
              {isOwner ? <span className="text-stone-400 font-normal"> (you)</span> : null}
            </div>
          )}
        </div>
      </header>

      {/* Thread */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scroll-thin px-6 py-5 space-y-4">
        {conversation.items.map((it) => (
          <Exchange key={it.message.id} item={it} />
        ))}
        {sorting && open ? (
          <div className="flex justify-end">
            <div className="text-xs text-stone-500 flex items-center gap-2 bg-white border border-stone-200 rounded-full px-3 py-1.5">
              <span className="h-3 w-3 rounded-full border-2 border-stone-300 border-t-brand animate-spin" />
              {open.error ? (
                <span>
                  Could not sort this: {open.error}.{" "}
                  <button className="text-brand underline" onClick={rerun}>
                    Try again
                  </button>
                  {session ? (
                    <>
                      {" · "}
                      <button className="text-brand underline" onClick={() => dispatch({ type: "manual_start", id, by: session.staffId })}>
                        Write the reply yourself
                      </button>
                    </>
                  ) : null}
                </span>
              ) : (
                "AI agent is reading this, finding the booking, checking prices and policies…"
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Composer */}
      <div className="border-t border-stone-200 bg-white px-5 py-4 shrink-0">
        {!open ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs text-stone-500">
              <span className="font-semibold text-stone-700 flex items-center gap-1.5">
                <span>✍️</span> Send manual reply or follow-up to {m.fromName}
              </span>
              <span className="text-stone-400">
                {m.gmail ? "Delivered to guest via live Gmail" : "Desk simulation"}
              </span>
            </div>
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              rows={3}
              placeholder={`Type a manual message to ${m.fromName}…`}
              className="w-full rounded-xl border border-stone-300 px-4 py-3 text-[15px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <div className="flex items-center gap-2">
              <Button onClick={() => sendManualReply(manualText, id)} disabled={busy || !manualText.trim()}>
                {busy ? "Sending…" : "Send Manual Reply"}
              </Button>
            </div>
          </div>
        ) : !p ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs text-stone-500">
              <span className="font-semibold text-stone-700">✍️ Write manual reply to {m.fromName}</span>
            </div>
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              rows={4}
              placeholder={`Type your reply to ${m.fromName}…`}
              className="w-full rounded-xl border border-stone-300 px-4 py-3 text-[15px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <div className="flex items-center gap-2">
              <Button onClick={() => sendManualReply(manualText, id)} disabled={busy || !manualText.trim()}>
                {busy ? "Sending…" : "Send Manual Reply"}
              </Button>
            </div>
          </div>
        ) : !canAct ? (
          <div className="flex items-center justify-between text-sm text-stone-600 bg-stone-50 p-3.5 rounded-xl border border-stone-200">
            <span>
              <span className="font-medium text-stone-800">{ownerName(open.ownerId)}</span> owns this conversation.
            </span>
            {session ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => dispatch({ type: "reassign", id, ownerId: session.staffId, by: session.staffId })}
              >
                Take ownership & reply
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <div className="inline-flex rounded-lg border border-stone-200 bg-stone-100 p-0.5 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => {
                    setReplyMode("ai");
                    if (p.draftReply) dispatch({ type: "set_draft", id, draft: p.draftReply });
                  }}
                  className={`px-3 py-1 rounded-md transition ${
                    replyMode === "ai"
                      ? "bg-white text-stone-900 shadow-sm font-semibold"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  🤖 AI Draft
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReplyMode("manual");
                    dispatch({ type: "set_draft", id, draft: "" });
                  }}
                  className={`px-3 py-1 rounded-md transition ${
                    replyMode === "manual"
                      ? "bg-white text-stone-900 shadow-sm font-semibold"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  ✍️ Write Manually
                </button>
              </div>
              {replyMode === "ai" && (open.draft ?? p.draftReply) !== p.draftReply ? (
                <button
                  onClick={() => dispatch({ type: "set_draft", id, draft: p.draftReply })}
                  className="text-xs text-stone-500 hover:underline"
                >
                  Reset to original AI draft
                </button>
              ) : null}
            </div>
            <textarea
              value={open.draft ?? (replyMode === "manual" ? "" : p.draftReply)}
              onChange={(e) => dispatch({ type: "set_draft", id, draft: e.target.value })}
              rows={Math.min(10, Math.max(3, (open.draft ?? (replyMode === "manual" ? "" : p.draftReply)).split("\n").length))}
              placeholder={replyMode === "manual" ? `Write your manual reply to ${m.fromName}…` : "Edit the AI draft…"}
              className="w-full rounded-xl border border-stone-300 px-4 py-3 text-[15px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <Button
                onClick={() => executeNow(true)}
                disabled={busy || !(open.draft ?? (replyMode === "manual" ? "" : p.draftReply)).trim()}
              >
                {busy
                  ? "Sending…"
                  : replyMode === "manual"
                    ? "Send Manual Reply"
                    : approvedCount
                      ? `Approve & send · ${approvedCount} action${approvedCount === 1 ? "" : "s"}`
                      : "Send"}
              </Button>
              <Button variant="ghost" onClick={() => executeNow(false)} disabled={busy}>
                {handoff ? "Hand off without replying" : p.actions.length ? "Do the actions, no reply" : "Close without replying"}
              </Button>
              <span className="ml-auto text-[11px] text-stone-400 xl:hidden">Booking and actions show at wider widths.</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
