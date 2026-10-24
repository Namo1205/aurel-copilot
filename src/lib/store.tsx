"use client";

// Client-side state for the prototype. Persisted to localStorage so a reviewer's
// session survives reloads and serverless cold starts. API routes are stateless.

import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { SEED_MESSAGES, type InboundMessage } from "@/lib/inbox/seed";
import type { AnalysisResult } from "@/lib/agent";
import type { ExecutionResult, Handoff } from "@/lib/agent/execute";
import type { Category } from "@/lib/agent/schema";
import type { Booking, Trace } from "@/lib/pms";
import { BOOKINGS, createTrace, getBooking, getGuest, getHotel } from "@/lib/pms";
import { TEMPLATES } from "@/lib/agent/templates";
import { AI_OWNER_ID, assignOwner, importantReasons, isOnShift, queueFor, shiftEnded, staffById, type Queue, type Role, type ShiftOverrides } from "@/lib/desk/roster";

export type ItemStatus = "new" | "analyzing" | "drafted" | "sent" | "handed_off" | "auto_sent";

export interface InboxItem {
  message: InboundMessage;
  receivedAt: string;
  status: ItemStatus;
  analysis?: AnalysisResult;
  error?: string;
  draft?: string;
  approved?: boolean[];
  result?: ExecutionResult;
  handledAt?: string;
  handledBy?: string;
  edited?: boolean;
  // Owner on arrival, queue, Important view.
  ownerId: string | null;
  ownerRule?: string;
  queue: Queue;
  important: string[];
  // Agent changed the AI agent's type (a correction).
  typeOverride?: Category;
  // A template or cited policy answer that went out without a person.
  autoSentAt?: string;
  autoSentBody?: string;
  // Live Gmail: whether the text the AI agent sent alone really left the mailbox.
  delivery?: { via: "gmail"; at: string; error?: string };
  // Every owner change: arrival, manual reassign, shift-end handover.
  ownerHistory?: OwnerChange[];
}

export interface OwnerChange {
  from: string | null;
  to: string;
  at: string;
  reason: string;
}

export interface Handover {
  at: string;
  from: string;
  to: string;
  itemId: string;
  reason: string;
}

export const NOBODY_TO_HAND_TO = "Owner off shift, nobody to hand to";

export interface Session {
  staffId: string;
  role: Role;
  name: string;
}

export interface State {
  items: Record<string, InboxItem>;
  order: string[];
  traces: Trace[];
  handoffs: Handoff[];
  bookingUpdates: Booking[];
  selectedId: string | null;
  hydrated: boolean;
  rotation: number;
  session: Session | null;
  // Live mailbox status, fetched once per page load.
  gmail: { configured: boolean; address: string | null; send: boolean; error?: string } | null;
  // Whether the sample messages from the brief are on the desk.
  samples: "none" | "loaded" | "cleared";
  // End my shift / Start my shift, per person, for today.
  shiftOverrides: ShiftOverrides;
  // Shift-end handovers, newest first.
  handovers: Handover[];
}

type Action =
  | { type: "hydrate"; state: Partial<State> }
  | { type: "select"; id: string }
  | { type: "add_message"; message: InboundMessage }
  | { type: "analyzing"; id: string }
  | { type: "analyzed"; id: string; analysis: AnalysisResult }
  | { type: "analyze_failed"; id: string; error: string }
  | { type: "set_draft"; id: string; draft: string }
  | { type: "toggle_action"; id: string; index: number }
  | { type: "executed"; id: string; result: ExecutionResult; status: ItemStatus; by: string }
  | { type: "trace_status"; traceId: string; status: Trace["status"] }
  | { type: "override_type"; id: string; category: Category }
  | { type: "reassign"; id: string; ownerId: string; by?: string }
  | { type: "login"; session: Session }
  | { type: "logout" }
  | { type: "day_before_run"; by: string }
  | { type: "delivered"; id: string; delivery: NonNullable<InboxItem["delivery"]> }
  | { type: "gmail_status"; gmail: NonNullable<State["gmail"]> }
  | { type: "load_samples" }
  | { type: "clear_samples" }
  | { type: "shift_override"; staffId: string; on: boolean }
  // A reply that Gmail could not deliver was sent again (possibly edited) by a person.
  | { type: "resend_result"; id: string; ok: boolean; body: string; at: string; by: string; error?: string }
  // Sorting failed, or the person wants to write the reply themselves from scratch.
  | { type: "manual_start"; id: string; by: string }
  // Employee manually replies to a conversation (either open or previously resolved).
  | { type: "manual_reply"; id: string; body: string; by: string; delivery?: { via: "gmail"; at: string; error?: string } }
  | { type: "shift_tick"; now: string }
  | { type: "reset" };

const KEY = "aurel-desk-state-v2";

const EMPTY: State = { items: {}, order: [], traces: [], handoffs: [], bookingUpdates: [], selectedId: null, hydrated: false, rotation: 0, session: null, gmail: null, samples: "none", shiftOverrides: {}, handovers: [] };

// The desk starts empty. Sample messages are loaded only in demo mode (no mailbox
// connected) or when someone asks for them on the sign-in page.
function withSamples(state: State): State {
  const now = Date.now();
  const items = { ...state.items };
  const order = [...state.order];
  for (const m of SEED_MESSAGES) {
    if (items[m.id]) continue;
    items[m.id] = { message: m, receivedAt: new Date(now - m.receivedMinutesAgo * 60000).toISOString(), status: "new", ownerId: null, queue: "agent", important: [] };
    order.push(m.id);
  }
  return { ...state, items, order, selectedId: state.selectedId ?? SEED_MESSAGES[0].id, samples: "loaded" };
}

export function isSample(id: string): boolean {
  return SEED_MESSAGES.some((m) => m.id === id);
}

function withoutSamples(state: State): State {
  const items = Object.fromEntries(Object.entries(state.items).filter(([id]) => !isSample(id)));
  const order = state.order.filter((id) => !isSample(id));
  return { ...state, items, order, selectedId: state.selectedId && items[state.selectedId] ? state.selectedId : (order[0] ?? null), samples: "cleared" };
}

export function isPending(item: InboxItem): boolean {
  return item.status === "new" || item.status === "analyzing" || item.status === "drafted";
}

export function pendingByOwner(state: State): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of state.order) {
    const it = state.items[id];
    if (isPending(it) && it.ownerId) out[it.ownerId] = (out[it.ownerId] ?? 0) + 1;
  }
  return out;
}

export function effectiveCategory(item: InboxItem): Category | undefined {
  return item.typeOverride ?? item.analysis?.proposal.triage.category;
}

function isVipOrAdvisor(item: InboxItem, bookingId: string | null): boolean {
  const text = `${item.message.subject ?? ""} ${item.message.body} ${item.message.fromName}`;
  if (/\b(vip|travel advisor|luxury programme|luxury program|virtuoso|advisor)\b/i.test(text)) return true;
  const b = bookingId ? getBooking(bookingId) : undefined;
  return !!(b && getGuest(b.guestId)?.vip);
}

// When people go off shift, every pending item they own moves by the same owner rule
// that assigned it on arrival. If nobody of the right role is on shift the item stays,
// flagged, so a senior or manager sees it on the dashboard.
export function handoverFrom(state: State, staffIds: string[], now: Date, reason: string): State {
  const leaving = new Set(staffIds);
  const items = { ...state.items };
  let rotation = state.rotation;
  const handovers = [...state.handovers];
  const at = now.toISOString();
  for (const id of state.order) {
    const it = items[id];
    if (!it.ownerId || !leaving.has(it.ownerId) || !isPending(it) || !it.analysis) continue;
    const pending = pendingByOwner({ ...state, items });
    const vip = it.important.includes("VIP or travel advisor");
    const assign = assignOwner({ proposal: it.analysis.proposal, pendingByOwner: pending, rotation, isVipOrAdvisor: vip, now, overrides: state.shiftOverrides });
    const target = staffById(assign.ownerId);
    const usable = assign.ownerId !== it.ownerId && !!target && isOnShift(target, now, state.shiftOverrides);
    if (!usable) {
      if (!it.important.includes(NOBODY_TO_HAND_TO)) items[id] = { ...it, important: [...it.important, NOBODY_TO_HAND_TO] };
      continue;
    }
    rotation = assign.rotation;
    const fromName = staffById(it.ownerId)?.name ?? it.ownerId;
    const why = `Handed over from ${fromName} at ${reason}: ${assign.rule.replace(/\.$/, "")}`;
    items[id] = {
      ...it,
      ownerId: assign.ownerId,
      ownerRule: `${why}.`,
      important: it.important.filter((r) => r !== NOBODY_TO_HAND_TO),
      ownerHistory: [...(it.ownerHistory ?? []), { from: it.ownerId, to: assign.ownerId, at, reason: why }],
    };
    handovers.unshift({ at, from: it.ownerId, to: assign.ownerId, itemId: id, reason });
  }
  return { ...state, items, rotation, handovers };
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "hydrate":
      return { ...state, ...action.state, hydrated: true };
    case "select":
      return { ...state, selectedId: action.id };
    case "add_message": {
      if (state.items[action.message.id]) return state;
      const receivedAt = new Date(Date.now() - (action.message.receivedMinutesAgo ?? 0) * 60000).toISOString();
      if (action.message.serverAnalysis) {
        const p = action.message.serverAnalysis.proposal;
        const bookingId = p.bookingMatch.bookingId;
        const vip = isVipOrAdvisor({ message: action.message, important: [] } as unknown as InboxItem, bookingId);
        const assign = assignOwner({ proposal: p, pendingByOwner: pendingByOwner(state), rotation: state.rotation, isVipOrAdvisor: vip, now: new Date(), overrides: state.shiftOverrides });
        const queue = queueFor(p);
        const booking = bookingId ? getBooking(bookingId) : undefined;
        const important = importantReasons({
          proposal: p,
          body: action.message.body,
          arrivalIso: booking?.checkIn ?? null,
          now: new Date(),
          isVipOrAdvisor: vip,
          isRepeat: /third time|second time|again|chasing|still (no|haven't|not)|nobody (has )?(replied|answered)/i.test(action.message.body),
        });
        const nowIso = action.message.serverAutoSent?.at ?? new Date().toISOString();
        const auto = p.autoSend.kind !== "none";
        const closed = p.autoSend.kind === "policy_answer";
        const item: InboxItem = {
          message: action.message,
          receivedAt,
          status: closed ? "auto_sent" : "drafted",
          analysis: action.message.serverAnalysis,
          draft: p.draftReply,
          approved: p.actions.map(() => true),
          ownerId: closed ? AI_OWNER_ID : assign.ownerId,
          ownerRule: closed ? "Policy-only message answered from cited policy; the AI agent owns it." : assign.rule,
          ownerHistory: [{ from: null, to: closed ? AI_OWNER_ID : assign.ownerId, at: nowIso, reason: closed ? "Sent alone" : assign.rule }],
          queue,
          important,
          autoSentAt: auto ? nowIso : undefined,
          autoSentBody: auto ? (action.message.serverAutoSent?.body ?? p.autoSend.body ?? p.draftReply) : undefined,
          delivery: action.message.serverAutoSent?.delivery,
          handledAt: closed ? nowIso : undefined,
          handledBy: closed ? AI_OWNER_ID : undefined,
        };
        return {
          ...state,
          items: {
            ...state.items,
            [action.message.id]: item,
          },
          order: [action.message.id, ...state.order],
          selectedId: action.message.id,
          rotation: assign.rotation,
        };
      }
      return {
        ...state,
        items: {
          ...state.items,
          [action.message.id]: { message: action.message, receivedAt, status: "new", ownerId: null, queue: "agent", important: [] },
        },
        order: [action.message.id, ...state.order],
        selectedId: action.message.id,
      };
    }
    case "delivered":
      return patch(state, action.id, { delivery: action.delivery });
    case "analyzing":
      return patch(state, action.id, { status: "analyzing", error: undefined });
    case "analyzed": {
      const item = state.items[action.id];
      const p = action.analysis.proposal;
      const bookingId = p.bookingMatch.bookingId;
      const vip = isVipOrAdvisor(item, bookingId);
      const assign = assignOwner({ proposal: p, pendingByOwner: pendingByOwner(state), rotation: state.rotation, isVipOrAdvisor: vip, now: new Date(), overrides: state.shiftOverrides });
      const queue = queueFor(p);
      const booking = bookingId ? getBooking(bookingId) : undefined;
      const important = importantReasons({
        proposal: p,
        body: item.message.body,
        arrivalIso: booking?.checkIn ?? null,
        now: new Date(),
        isVipOrAdvisor: vip,
        isRepeat: /third time|second time|again|chasing|still (no|haven't|not)|nobody (has )?(replied|answered)/i.test(item.message.body),
      });
      const nowIso = new Date().toISOString();
      const auto = p.autoSend.kind !== "none";
      const closed = p.autoSend.kind === "policy_answer";
      const next = patch(state, action.id, {
        status: closed ? "auto_sent" : "drafted",
        analysis: action.analysis,
        draft: p.draftReply,
        approved: p.actions.map(() => true),
        ownerId: closed ? AI_OWNER_ID : assign.ownerId,
        ownerRule: closed ? "Policy-only message answered from cited policy; the AI agent owns it." : assign.rule,
        ownerHistory: [{ from: null, to: closed ? AI_OWNER_ID : assign.ownerId, at: nowIso, reason: closed ? "Sent alone" : assign.rule }],
        queue,
        important,
        autoSentAt: auto ? nowIso : undefined,
        autoSentBody: auto ? (p.autoSend.body ?? p.draftReply) : undefined,
        handledAt: closed ? nowIso : undefined,
        handledBy: closed ? AI_OWNER_ID : undefined,
      });
      return { ...next, rotation: assign.rotation };
    }
    case "analyze_failed":
      return patch(state, action.id, { status: "new", error: action.error });
    case "set_draft":
      return patch(state, action.id, { draft: action.draft });
    case "toggle_action": {
      const approved = [...(state.items[action.id].approved ?? [])];
      approved[action.index] = !approved[action.index];
      return patch(state, action.id, { approved });
    }
    case "executed": {
      const item = state.items[action.id];
      const edited = !!item.analysis && (item.draft ?? "") !== item.analysis.proposal.draftReply;
      return {
        ...patch(state, action.id, { status: action.status, result: action.result, handledAt: new Date().toISOString(), handledBy: action.by, edited }),
        traces: [...state.traces, ...action.result.traces],
        handoffs: [...state.handoffs, ...action.result.handoffs],
        bookingUpdates: [...state.bookingUpdates, ...action.result.bookingUpdates],
      };
    }
    case "trace_status":
      return { ...state, traces: state.traces.map((t) => (t.id === action.traceId ? { ...t, status: action.status } : t)) };
    case "override_type":
      return patch(state, action.id, { typeOverride: action.category });
    case "reassign": {
      const it = state.items[action.id];
      if (!it || it.ownerId === action.ownerId) return state;
      const reason = `Reassigned by ${action.by ? (staffById(action.by)?.name ?? action.by) : "a senior or manager"}`;
      return patch(state, action.id, {
        ownerId: action.ownerId,
        ownerRule: `${reason}.`,
        important: it.important.filter((r) => r !== NOBODY_TO_HAND_TO),
        ownerHistory: [...(it.ownerHistory ?? []), { from: it.ownerId, to: action.ownerId, at: new Date().toISOString(), reason }],
      });
    }
    case "resend_result": {
      const it = state.items[action.id];
      if (!it) return state;
      const delivery = { via: "gmail" as const, at: action.at, error: action.ok ? undefined : action.error ?? "send failed" };
      if (it.result?.sentReply) {
        return patch(state, action.id, {
          result: { ...it.result, sentReply: { ...it.result.sentReply, body: action.body, sentAt: action.ok ? action.at : it.result.sentReply.sentAt, deliveredVia: action.ok ? "gmail" : undefined, deliveryError: action.ok ? undefined : action.error ?? "send failed" } },
          handledBy: action.ok ? action.by : it.handledBy,
          edited: it.edited || action.body !== it.result.sentReply.body,
        });
      }
      return patch(state, action.id, { delivery, autoSentBody: action.ok ? action.body : it.autoSentBody, handledBy: action.ok ? action.by : it.handledBy });
    }
    case "manual_start": {
      const it = state.items[action.id];
      if (!it) return state;
      const nowIso = new Date().toISOString();
      const stub: AnalysisResult = {
        engine: "rules",
        latencyMs: 0,
        proposal: {
          triage: { category: "other", secondaryCategories: [], hotelId: null, urgency: "normal", language: "en", summary: "Written by hand: the AI agent could not sort this message." },
          bookingMatch: { bookingId: it.message.bookingRef ?? null, confidence: it.message.bookingRef ? "high" : "none", note: it.message.bookingRef ? "Reference carried by the message." : "No sorting ran." },
          sensitiveData: { present: false, types: [], handling: "Not checked by the AI agent; the person replying is responsible." },
          actions: [],
          draftReply: "",
          didNotPromise: [],
          policyCitations: [],
          confidence: 0,
          autoSendEligible: false,
          autoSend: { kind: "none", reason: "" },
          requiresHuman: true,
          requiresHumanReason: "Sorting failed; a person writes the reply.",
        },
      };
      return patch(state, action.id, {
        status: "drafted",
        error: undefined,
        analysis: stub,
        draft: "",
        approved: [],
        queue: "agent",
        ownerId: action.by,
        ownerRule: "Taken by hand after sorting failed.",
        ownerHistory: [...(it.ownerHistory ?? []), { from: it.ownerId, to: action.by, at: nowIso, reason: "Taken by hand after sorting failed" }],
      });
    }
    case "manual_reply": {
      const it = state.items[action.id];
      if (!it) return state;
      const nowIso = new Date().toISOString();
      const newReply = {
        channel: it.message.channel,
        sentAt: nowIso,
        body: action.body,
        to: it.message.from,
        deliveredVia: action.delivery?.via,
        deliveryError: action.delivery?.error,
      };
      return patch(state, action.id, {
        status: "sent",
        result: {
          traces: it.result?.traces ?? [],
          handoffs: it.result?.handoffs ?? [],
          bookingUpdates: it.result?.bookingUpdates ?? [],
          paymentLinks: it.result?.paymentLinks ?? [],
          skipped: it.result?.skipped ?? [],
          sentReply: newReply,
        },
        handledAt: nowIso,
        handledBy: action.by,
        edited: true,
      });
    }
    case "shift_override": {
      const overrides: ShiftOverrides = { ...state.shiftOverrides, [action.staffId]: action.on ? "on" : "off" };
      const next = { ...state, shiftOverrides: overrides };
      return action.on ? next : handoverFrom(next, [action.staffId], new Date(), "shift end");
    }
    case "shift_tick": {
      const now = new Date(action.now);
      const ended = shiftEnded(now, state.shiftOverrides);
      if (!ended.length) return state;
      const overrides: ShiftOverrides = { ...state.shiftOverrides };
      for (const s of ended) overrides[s.id] = "off";
      return handoverFrom({ ...state, shiftOverrides: overrides }, ended.map((s) => s.id), now, "shift end");
    }
    case "login":
      return { ...state, session: action.session };
    case "logout":
      return { ...state, session: null };
    case "day_before_run": {
      // PRD Flow B: every booking arriving tomorrow gets the fixed day-before
      // message; bookings with a request, a restricted trace or a VIP flag get
      // a front-office call instead, created as a trace.
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const nowIso = new Date().toISOString();
      const items = { ...state.items };
      let order = [...state.order];
      let traces = [...state.traces];
      for (const b of BOOKINGS.filter((x) => x.checkIn === tomorrow && x.status !== "cancelled")) {
        const id = `db-${b.id}`;
        if (items[id]) continue;
        const guest = getGuest(b.guestId);
        const hotel = getHotel(b.hotelId)!;
        const name = guest?.name ?? b.surname;
        const first = name.split(" ")[0];
        const hasRequest = /request|cot|transfer|check-out|check-in|table|dinner|allerg|wheelchair/i.test(b.notes) || traces.some((t) => t.bookingId === b.id && t.status !== "done");
        const restricted = traces.some((t) => t.bookingId === b.id && t.sensitive);
        const needsCall = hasRequest || restricted || !!guest?.vip;
        items[id] = {
          message: {
            id,
            channel: "email",
            from: guest?.email ?? "guest",
            fromName: `${name} · day-before check`,
            subject: `Day-before check · ${hotel.name} · arriving ${b.checkIn}`,
            body: needsCall
              ? `Outbound. ${hotel.name} front office will call ${name} today to confirm arrival time, run through the requests${guest?.vip ? ", apply the programme amenities" : ""} and decide early check-in. A trace has been created for the call.`
              : `Outbound. The fixed day-before message was sent to ${name} asking for arrival time and anything else needed. Any reply lands in the desk like a normal message.`,
            receivedMinutesAgo: 0,
            bookingRef: b.id,
          },
          receivedAt: nowIso,
          status: "auto_sent",
          ownerId: AI_OWNER_ID,
          ownerRule: "Day-before check, fixed template; the AI agent owns it.",
          queue: "auto",
          important: [],
          autoSentAt: nowIso,
          autoSentBody: needsCall ? undefined : TEMPLATES.day_before({ name: first, hotel: hotel.name, checkIn: b.checkIn, channel: "email" }),
          handledAt: nowIso,
          handledBy: needsCall ? action.by : AI_OWNER_ID,
        };
        order = [id, ...order];
        if (needsCall) {
          traces = [
            ...traces,
            createTrace({
              hotelId: b.hotelId,
              bookingId: b.id,
              department: "front_office",
              summary: `Day-before call to ${name}${guest?.vip ? " (VIP, programme guest)" : ""}: confirm arrival time, run through requests${b.notes ? ` (${b.notes})` : ""}, decide early check-in on the spot.`,
              due: new Date().toISOString().slice(0, 10),
              sensitive: restricted,
              source: "day-before check",
            }),
          ];
        }
      }
      return { ...state, items, order, traces };
    }
    case "gmail_status":
      return { ...state, gmail: action.gmail };
    case "load_samples":
      return withSamples(state);
    case "clear_samples":
      return withoutSamples(state);
    case "reset":
      return { ...EMPTY, hydrated: true, session: state.session, gmail: state.gmail, samples: "cleared" };
  }
}

function patch(state: State, id: string, p: Partial<InboxItem>): State {
  return { ...state, items: { ...state.items, [id]: { ...state.items[id], ...p } } };
}

const Ctx = createContext<{ state: State; dispatch: (a: Action) => void } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, EMPTY);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<State>;
        if (saved.items) for (const it of Object.values(saved.items)) if (it.status === "analyzing") it.status = "new";
        dispatch({ type: "hydrate", state: { ...saved, gmail: null } });
      } else {
        dispatch({ type: "hydrate", state: {} });
      }
    } catch {
      dispatch({ type: "hydrate", state: {} });
    }
    fetch("/api/gmail/status")
      .then((r) => r.json())
      .then((g) => dispatch({ type: "gmail_status", gmail: g }))
      .catch(() => dispatch({ type: "gmail_status", gmail: { configured: false, address: null, send: false } }));
  }, []);

  // Demo mode (no mailbox): put the sample messages on the desk once. Live mode: take
  // any samples off, so only real guest mail is shown.
  useEffect(() => {
    if (!state.hydrated || !state.gmail) return;
    if (!state.gmail.configured && state.samples === "none" && state.order.length === 0) dispatch({ type: "load_samples" });
    // Only samples left over from before the mailbox was connected; ones a person loaded on purpose stay.
    if (state.gmail.configured && state.samples === "none" && state.order.some(isSample)) dispatch({ type: "clear_samples" });
  }, [state.hydrated, state.gmail, state.samples, state.order]);

  useEffect(() => {
    if (!state.hydrated) return;
    const { hydrated: _h, ...rest } = state;
    void _h;
    localStorage.setItem(KEY, JSON.stringify(rest));
  }, [state]);

  // Owner on arrival: analyse every new item in the background, one at a time,
  // so each message has a type, a queue and an owner before anyone opens it.
  const busy = useRef(false);
  useEffect(() => {
    if (!state.hydrated || busy.current) return;
    const nextId = state.order.find((id) => state.items[id].status === "new" && !state.items[id].error);
    if (!nextId) return;
    busy.current = true;
    const item = state.items[nextId];
    dispatch({ type: "analyzing", id: nextId });
    // Sample messages are sorted by the rules engine so the model quota is kept for real mail.
    fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: item.message, engine: isSample(nextId) ? "rules" : undefined }) })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Analyse failed (${r.status})`);
        dispatch({ type: "analyzed", id: nextId, analysis: (await r.json()) as AnalysisResult });
      })
      .catch((e) => dispatch({ type: "analyze_failed", id: nextId, error: e instanceof Error ? e.message : String(e) }))
      .finally(() => {
        busy.current = false;
      });
  }, [state.hydrated, state.order, state.items]);

  // Shift ends: once a minute, hand over the items of anyone whose window has closed.
  useEffect(() => {
    if (!state.hydrated) return;
    const tick = () => dispatch({ type: "shift_tick", now: new Date().toISOString() });
    tick();
    const t = setInterval(tick, 60000);
    return () => clearInterval(t);
  }, [state.hydrated]);

  // Live Gmail: pull new mail every 20 seconds while a tab is open.
  useEffect(() => {
    if (!state.hydrated) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/gmail/poll");
        if (!r.ok) return;
        const { messages } = (await r.json()) as { messages: InboundMessage[] };
        if (stop) return;
        for (const m of messages) dispatch({ type: "add_message", message: m });
      } catch {
        // Offline or not configured: try again next tick.
      }
    };
    tick();
    const t = setInterval(tick, 20000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [state.hydrated]);

  // Live Gmail: what the AI agent sends alone really goes out, once, to the sender.
  const sending = useRef(new Set<string>());
  useEffect(() => {
    if (!state.hydrated) return;
    for (const id of state.order) {
      const it = state.items[id];
      if (!it.message.gmail || !it.autoSentAt || !it.autoSentBody || it.delivery || sending.current.has(id)) continue;
      sending.current.add(id);
      fetch("/api/gmail/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: it.message, body: it.autoSentBody }) })
        .then(async (r) => {
          const j = (await r.json()) as { ok: boolean; at?: string; error?: string };
          dispatch({ type: "delivered", id, delivery: { via: "gmail", at: j.at ?? new Date().toISOString(), error: j.ok ? undefined : (j.error ?? `HTTP ${r.status}`) } });
        })
        .catch((e) => dispatch({ type: "delivered", id, delivery: { via: "gmail", at: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) } }));
    }
  }, [state.hydrated, state.order, state.items]);

  // Dynamic browser tab title: e.g. "(3) Aurel Reservations" when pending items need review.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const count = state.order.filter((id) => {
      const it = state.items[id];
      return it && isPending(it);
    }).length;
    document.title = count > 0 ? `(${count}) Aurel Reservations` : "Aurel Reservations AI Agent";
  }, [state.order, state.items]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore outside StoreProvider");
  return ctx;
}

// Redirects to /login once hydrated if nobody is signed in.
export function useSessionGuard() {
  const { state } = useStore();
  const router = useRouter();
  useEffect(() => {
    if (state.hydrated && !state.session) router.replace("/login");
  }, [state.hydrated, state.session, router]);
  return state.session;
}
