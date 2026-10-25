"use client";

import { useEffect, useRef, useState } from "react";
import { useStore, withThreadContext, type InboxItem } from "@/lib/store";
import { Button, CHANNEL_LABEL, ChannelIcon, timeAgo } from "@/components/ui";
import { CATEGORY_LABEL, type Category } from "@/lib/agent/schema";
import { getHotel } from "@/lib/pms";
import { redactCards } from "@/lib/agent/rules";
import type { AnalysisResult } from "@/lib/agent";
import type { ExecutionResult } from "@/lib/agent/execute";
import { ASSISTANT_NAME, CATEGORY_ORDER, ROSTER, isOnShift, ownerName } from "@/lib/desk/roster";
import type { Conversation } from "@/lib/desk/visibility";
import { AttachmentPicker, InboundAttachments, PaperclipIcon, encodeFiles, useAttachDrop } from "@/components/desk/Attachments";
import { draftGaps } from "@/lib/agent/templates";

export function ago(iso: string): string {
  const t = timeAgo(iso);
  return t === "just now" ? "just now" : `${t} ago`;
}

const AUTO_SEND_LABEL: Record<string, string> = {
  policy_answer: "policy answer, sent alone",
  holding_reply: "holding reply, sent alone",
  group_ack: "group acknowledgement, sent alone",
  off_topic_decline: "decline, sent alone",
  ask_hotel: "asked which hotel, sent alone",
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
        <InboundAttachments message={m} />
      </Bubble>
      {item.autoSentAt && item.autoSentBody ? (
        <div className="flex justify-end">
          <div className="max-w-[78%]">
            <div className="text-[11px] text-stone-400 mb-1 text-right">
              {ASSISTANT_NAME} · {p ? AUTO_SEND_LABEL[p.autoSend.kind] ?? "sent alone" : "sent alone"} · {ago(item.autoSentAt)}
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
              {item.edited ? " · edited the suggested reply" : " · suggested reply as written"}
              {item.result.sentReply.deliveredVia === "gmail" ? " · delivered" : item.result.sentReply.deliveryError ? <span className="text-rose-700"> · not delivered</span> : null}
            </div>
            {item.result.sentReply.deliveryError ? (
              <ResendBox item={item} body={item.result.sentReply.body} error={item.result.sentReply.deliveryError} />
            ) : (
              <div className="inline-block text-left rounded-2xl rounded-tr-md px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap bg-brand text-white">{item.result.sentReply.body}</div>
            )}
            {item.result.sentReply.attachments?.length ? (
              <div className="mt-1 text-[11px] text-stone-500 text-right inline-flex items-center gap-1 w-full justify-end">
                <PaperclipIcon /> {item.result.sentReply.attachments.map((a) => a.name).join(", ")}
                {item.result.sentReply.deliveryError ? <span className="text-rose-700"> · not re-sent on retry, attach again if needed</span> : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {item.status === "handed_off" ? <div className="text-center text-[11px] text-stone-400">Closed without a reply by {ownerName(item.handledBy ?? null)} · {item.handledAt ? ago(item.handledAt) : ""}</div> : null}
    </>
  );
}

export function Thread({ conversation, detailsShown, onToggleDetails }: { conversation: Conversation; detailsShown: boolean; onToggleDetails: () => void }) {
  const { state, dispatch } = useStore();
  const session = state.session;
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [now] = useState(() => new Date());
  // A quote that got no reply: the prepared follow-up is offered in the reply box.
  const latestItem = conversation.open ?? conversation.latest;
  const pendingFollowUp = !conversation.open && latestItem.followUp && !latestItem.followUp.sentAt && !latestItem.followUp.dismissedAt ? latestItem.followUp : null;
  const [manualText, setManualText] = useState("");
  // While a follow-up is pending and the box is empty, the box shows the suggested text.
  const followUpText = manualText || pendingFollowUp?.draft || "";
  const [files, setFiles] = useState<File[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const onFiles = (next: File[], error: string | null) => {
    setFiles(next);
    setAttachError(error);
  };
  const open = conversation.open;
  const head = open ?? conversation.latest;
  const m = head.message;
  const { dragging, handlers: dropHandlers } = useAttachDrop(!!m.gmail, files, onFiles);
  const boxClass = `w-full rounded-xl border px-4 py-3 text-[15px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand/30 ${dragging ? "border-brand ring-2 ring-brand/40 bg-brand-soft/30" : "border-stone-300"}`;
  const dropHint = m.gmail ? <span className="text-[11px] text-stone-400">or drop a file on the box, or paste a screenshot</span> : null;
  const [replyMode, setReplyMode] = useState<"ai" | "manual">("ai");
  const scrollRef = useRef<HTMLDivElement>(null);

  const sendManualReply = async (textToSend: string, targetId: string) => {
    if (!textToSend.trim() || !session) return;
    setBusy(true);
    try {
      const attachments = await encodeFiles(files);
      let delivery: { via: "gmail"; at: string; error?: string } | undefined;
      if (m.gmail) {
        try {
          const r = await fetch("/api/gmail/send", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: m, body: textToSend, attachments }),
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
        attachments: attachments.map((a) => ({ name: a.name, size: a.size })),
      });
      setManualText("");
      setFiles([]);
    } finally {
      setBusy(false);
    }
  };
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
  // Guardrail in code: a reply with a placeholder still in it cannot be sent.
  const currentDraft = open && p ? (open.draft ?? (replyMode === "manual" ? "" : p.draftReply)) : "";
  const gaps = draftGaps(currentDraft);
  const manualGaps = draftGaps(conversation.open ? manualText : followUpText);
  const gapLine = (list: string[]) => (list.length ? <p className="mt-2 text-xs text-rose-700">Fill in before sending: {list.join(", ")}</p> : null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [conversation.key, conversation.items.length, head.status]);

  const rerun = async () => {
    dispatch({ type: "analyzing", id });
    try {
      const r = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: withThreadContext(state, head) }) });
      if (!r.ok) throw new Error(`Sorting failed (${r.status})`);
      dispatch({ type: "analyzed", id, analysis: (await r.json()) as AnalysisResult });
    } catch (e) {
      dispatch({ type: "analyze_failed", id, error: e instanceof Error ? e.message : String(e) });
    }
  };

  const executeNow = async (sendReply: boolean) => {
    if (!p || !session || !open) return;
    setBusy(true);
    setSendError(null);
    try {
      const approvedActionIndexes = (open.approved ?? []).map((a, i) => (a ? i : -1)).filter((i) => i >= 0);
      const attachments = sendReply ? await encodeFiles(files) : [];
      const r = await fetch("/api/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: m, proposal: p, approvedActionIndexes, draftReply: open.draft ?? p.draftReply, sendReply, attachments }),
      });
      if (r.status === 401) {
        dispatch({ type: "logout" });
        return;
      }
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(`${j.error ?? `Could not send (${r.status}).`} Nothing was sent or written.`);
      }
      const result = (await r.json()) as ExecutionResult;
      if (result.blocked) {
        setSendError(result.blocked);
        return;
      }
      dispatch({ type: "executed", id, result, status: sendReply ? "sent" : "handed_off", by: session.staffId });
      setFiles([]);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
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
              <span className={`relative inline-flex items-center gap-1 font-medium -ml-1 px-1 rounded ${!open || !canAct ? "" : "hover:bg-stone-100"}`} title="Change the type if Aurel Assistant sorted it wrong. Counted as a correction.">
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
        <button
          onClick={onToggleDetails}
          aria-pressed={detailsShown}
          aria-label={detailsShown ? "Hide booking and actions" : "Show booking and actions"}
          title={detailsShown ? "Hide the details panel" : "Show the booking and the actions"}
          className={`h-8 w-8 shrink-0 grid place-items-center rounded-md transition ${detailsShown ? "bg-stone-100 text-stone-900" : "text-stone-500 hover:bg-stone-100 hover:text-stone-900"}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M15 4v16" />
          </svg>
        </button>
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
                "Aurel Assistant is reading this, finding the booking, checking prices and policies…"
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Composer */}
      <div className="border-t border-stone-200 bg-white px-5 py-4 shrink-0">
        {!open ? (
          <div className="space-y-2.5">
            {pendingFollowUp ? (
              <div className="flex items-center gap-2 text-xs rounded-lg border border-amber-200 bg-amber-50/70 text-amber-900 px-3 py-2">
                <span className="font-medium">Suggested follow-up:</span>
                <span>the quote sent {ago(head.result?.sentReply?.sentAt ?? head.handledAt ?? head.receivedAt)} has had no reply. Edit the text below or send it as it is.</span>
                <button onClick={() => dispatch({ type: "followup_dismiss", id })} className="ml-auto underline underline-offset-2 hover:text-amber-950">
                  No follow-up
                </button>
              </div>
            ) : null}
            <div className="flex items-center justify-between text-xs text-stone-500">
              <span className="font-semibold text-stone-700 flex items-center gap-1.5">
                Reply or follow up to {m.fromName}
              </span>
              <span className="text-stone-400">
                {m.gmail ? "Delivered to guest via live Gmail" : "Desk simulation"}
              </span>
            </div>
            <textarea
              value={followUpText}
              onChange={(e) => setManualText(e.target.value)}
              rows={pendingFollowUp ? 6 : 3}
              placeholder={`Write to ${m.fromName}…`}
              className={boxClass}
              {...dropHandlers}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Button onClick={() => sendManualReply(followUpText, id)} disabled={busy || !followUpText.trim() || manualGaps.length > 0}>
                {busy ? "Sending…" : "Send"}
              </Button>
              {m.gmail ? <AttachmentPicker files={files} onChange={onFiles} disabled={busy} /> : null}
              {dropHint}
            </div>
            {gapLine(manualGaps)}
            {attachError ? <p className="text-xs text-rose-700">{attachError}</p> : null}
          </div>
        ) : !p ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs text-stone-500">
              <span className="font-semibold text-stone-700">Write your reply to {m.fromName}</span>
            </div>
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              rows={4}
              placeholder={`Write your reply to ${m.fromName}…`}
              className={boxClass}
              {...dropHandlers}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Button onClick={() => sendManualReply(manualText, id)} disabled={busy || !manualText.trim() || manualGaps.length > 0}>
                {busy ? "Sending…" : "Send"}
              </Button>
              {m.gmail ? <AttachmentPicker files={files} onChange={onFiles} disabled={busy} /> : null}
              {dropHint}
            </div>
            {gapLine(manualGaps)}
            {attachError ? <p className="text-xs text-rose-700">{attachError}</p> : null}
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
                  Suggested reply
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
                  Write it yourself
                </button>
              </div>
              {replyMode === "ai" && (open.draft ?? p.draftReply) !== p.draftReply ? (
                <button
                  onClick={() => dispatch({ type: "set_draft", id, draft: p.draftReply })}
                  className="text-xs text-stone-500 hover:underline"
                >
                  Back to the suggested reply
                </button>
              ) : null}
            </div>
            <textarea
              value={open.draft ?? (replyMode === "manual" ? "" : p.draftReply)}
              onChange={(e) => dispatch({ type: "set_draft", id, draft: e.target.value })}
              rows={Math.min(10, Math.max(3, (open.draft ?? (replyMode === "manual" ? "" : p.draftReply)).split("\n").length))}
              placeholder={replyMode === "manual" ? `Write your reply to ${m.fromName}…` : "Edit the suggested reply…"}
              className={boxClass}
              {...dropHandlers}
            />
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <Button
                onClick={() => executeNow(true)}
                disabled={busy || !currentDraft.trim() || gaps.length > 0}
                title={gaps.length ? `Fill in ${gaps.join(", ")} first` : undefined}
              >
                {busy
                  ? "Sending…"
                  : replyMode === "manual"
                    ? "Send"
                    : approvedCount
                      ? `Approve & send · ${approvedCount} action${approvedCount === 1 ? "" : "s"}`
                      : "Send"}
              </Button>
              <Button variant="ghost" onClick={() => executeNow(false)} disabled={busy}>
                {handoff ? "Hand off without replying" : p.actions.length ? "Do the actions, no reply" : "Close without replying"}
              </Button>
              {m.gmail ? <AttachmentPicker files={files} onChange={onFiles} disabled={busy} /> : null}
              {dropHint}
            </div>
            {gapLine(gaps)}
            {attachError ? <p className="mt-2 text-xs text-rose-700">{attachError}</p> : null}
            {sendError ? <p className="mt-2 text-xs text-rose-700">{sendError}</p> : null}
          </>
        )}
      </div>
    </div>
  );
}
