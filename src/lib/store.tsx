"use client";

// Client-side state for the prototype. Persisted to localStorage so a reviewer's
// session survives reloads and serverless cold starts. API routes are stateless.

import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { SEED_MESSAGES, type InboundMessage } from "@/lib/inbox/seed";
import type { AnalysisResult } from "@/lib/agent";
import type { ExecutionResult, Handoff } from "@/lib/agent/execute";
import { CATEGORY_LABEL, type Category } from "@/lib/agent/schema";
import type { Booking, Trace } from "@/lib/pms";
import { BOOKINGS, createTrace, getBooking, getGuest, getHotel } from "@/lib/pms";
import { TEMPLATES } from "@/lib/agent/templates";
import { AI_OWNER_ID, MAILBOX_OWNER_ID, ROSTER, assignOwner, importantReasons, isOnShift, queueFor, shiftEnded, staffById, type Queue, type Role, type ShiftOverrides } from "@/lib/desk/roster";

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

// Notifications. Only things the conversation list cannot show by itself: changes
// made to someone's work while they were not looking, and anything that failed.
// "A new message arrived" is never an event; the list is the inbox.
export type EventKind = "delivery_failed" | "moved_to_you" | "guest_replied" | "overdue" | "team_overdue" | "stuck_handover" | "manager_decision" | "shift_ending";
export type EventGroup = "needs" | "changed" | "today";
export interface DeskEvent {
  id: string;
  // Same key = same fact; appended once.
  key?: string;
  at: string;
  kind: EventKind;
  group: EventGroup;
  // A staff id, or "role:<role>" for everyone in that role.
  to: string;
  title: string;
  detail?: string;
  itemId?: string;
}

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
  // Notification events, newest first, capped.
  events: DeskEvent[];
  // Per person: when they last opened the bell.
  notificationsSeenAt: Record<string, string>;
  // Per person: the "new since you last looked" line. awayAt is set when they leave the
  // list (other page, background tab); it becomes newSince when they come back.
  listSeen: Record<string, { newSince: string | null; awayAt: string | null }>;
}

export type Action =
  | { type: "hydrate"; state: Partial<State> }
  | { type: "select"; id: string }
  | { type: "add_message"; message: InboundMessage }
  // A message read back from the mailbox with the reply the desk sent to it.
  | { type: "restore_message"; message: InboundMessage; receivedAt: string; reply: { body: string; at: string } }
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
  | { type: "notifications_seen"; staffId: string }
  | { type: "list_opened"; staffId: string }
  | { type: "list_left"; staffId: string; at: string }
  | { type: "reset" };

const KEY = "aurel-desk-state-v2";

const EMPTY: State = { items: {}, order: [], traces: [], handoffs: [], bookingUpdates: [], selectedId: null, hydrated: false, rotation: 0, session: null, gmail: null, samples: "none", shiftOverrides: {}, handovers: [], events: [], notificationsSeenAt: {}, listSeen: {} };
export const EMPTY_STATE: State = { ...EMPTY, hydrated: true };

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

// --- notification events -----------------------------------------------------

const EVENT_LIMIT = 300;
let eventSeq = 0;
type NewEvent = Omit<DeskEvent, "id">;

function withEvents(state: State, events: NewEvent[]): State {
  if (!events.length) return state;
  const keys = new Set(state.events.map((e) => e.key).filter(Boolean));
  const fresh: DeskEvent[] = [];
  for (const e of events) {
    if (e.key && keys.has(e.key)) continue;
    if (e.key) keys.add(e.key);
    fresh.push({ ...e, id: `ev-${Date.now().toString(36)}-${(eventSeq++).toString(36)}` });
  }
  if (!fresh.length) return state;
  return { ...state, events: [...fresh.reverse(), ...state.events].slice(0, EVENT_LIMIT) };
}

export function eventsFor(state: State, session: Session): DeskEvent[] {
  return state.events.filter((e) => e.to === session.staffId || e.to === `role:${session.role}`);
}

export function unreadEvents(state: State, session: Session): DeskEvent[] {
  const seen = state.notificationsSeenAt[session.staffId];
  return eventsFor(state, session).filter((e) => !seen || Date.parse(e.at) > Date.parse(seen));
}

// One conversation per Gmail thread; simulated messages group by sender.
function convKey(m: InboundMessage): string {
  return m.gmail?.threadId ? `thread:${m.gmail.threadId}` : `from:${m.from.toLowerCase()}`;
}

function catLabel(item: InboxItem): string {
  const c = effectiveCategory(item);
  return c ? ` · ${CATEGORY_LABEL[c]}` : "";
}

// A guest wrote again to a conversation a person had closed: tell that person.
function guestRepliedEvents(state: State, message: InboundMessage, at: string): NewEvent[] {
  const key = convKey(message);
  const thread = state.order.map((id) => state.items[id]).filter((i) => convKey(i.message) === key);
  if (!thread.length || thread.some(isPending)) return [];
  const last = [...thread].sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt))[thread.length - 1];
  if (!last.handledBy || last.handledBy === AI_OWNER_ID) return [];
  return [{ key: `guest_replied:${message.id}`, at, kind: "guest_replied", group: "changed", to: last.handledBy, title: "Guest replied to a conversation you closed", detail: `${message.fromName}: ${message.body.replace(/\s+/g, " ").slice(0, 90)}`, itemId: message.id }];
}

function managerEvents(message: InboundMessage, summary: string, queue: Queue, at: string): NewEvent[] {
  if (queue !== "manager") return [];
  return [{ key: `manager:${message.id}`, at, kind: "manager_decision", group: "needs", to: "role:manager", title: "Manager decision needed", detail: `${message.fromName} · ${summary}`, itemId: message.id }];
}

function deliveryFailedEvents(item: InboxItem, to: string[], error: string, at: string): NewEvent[] {
  return to.map((who) => ({ key: `delivery_failed:${item.message.id}:${who}:${at}`, at, kind: "delivery_failed" as const, group: "needs" as const, to: who, title: "Reply not delivered", detail: `${item.message.fromName} · ${error.slice(0, 90)}`, itemId: item.message.id }));
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Once a minute: items over an hour old, agents with several of them, shifts about to end.
function tickEvents(state: State, now: Date): NewEvent[] {
  const out: NewEvent[] = [];
  const at = now.toISOString();
  const day = at.slice(0, 10);
  const overdueByOwner: Record<string, InboxItem[]> = {};
  for (const id of state.order) {
    const it = state.items[id];
    if (!isPending(it) || !it.ownerId || it.ownerId === AI_OWNER_ID) continue;
    if ((now.getTime() - Date.parse(it.receivedAt)) / 60000 < 60) continue;
    (overdueByOwner[it.ownerId] ??= []).push(it);
    out.push({ key: `overdue:${id}`, at, kind: "overdue", group: "needs", to: it.ownerId, title: "Waiting over an hour", detail: `${it.message.fromName}${catLabel(it)}`, itemId: id });
  }
  for (const [ownerId, list] of Object.entries(overdueByOwner)) {
    if (list.length < 3) continue;
    const name = staffById(ownerId)?.name ?? ownerId;
    for (const to of ["role:senior", "role:manager"]) {
      out.push({ key: `team_overdue:${ownerId}:${day}:${to}`, at, kind: "team_overdue", group: "needs", to, title: `${name} has ${list.length} conversations over an hour old`, detail: list.slice(0, 3).map((i) => i.message.fromName).join(", ") });
    }
  }
  const t = now.getHours() * 60 + now.getMinutes();
  for (const s of ROSTER) {
    if (!s.shift || !isOnShift(s, now, state.shiftOverrides)) continue;
    const left = minutesOf(s.shift.end) - t;
    if (left <= 0 || left > 15) continue;
    const open = state.order.filter((id) => state.items[id].ownerId === s.id && isPending(state.items[id])).length;
    if (!open) continue;
    out.push({ key: `shift_ending:${s.id}:${day}`, at, kind: "shift_ending", group: "today", to: s.id, title: `Your shift ends at ${s.shift.end}`, detail: `${open} conversation${open === 1 ? "" : "s"} still open. Anything left moves to a colleague on shift by the owner rule.` });
  }
  return out;
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
  const moved = new Map<string, { to: string; from: string; names: string[] }>();
  const stuck = new Map<string, string[]>();
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
      stuck.set(it.ownerId, [...(stuck.get(it.ownerId) ?? []), it.message.fromName]);
      continue;
    }
    const pair = `${assign.ownerId}|${it.ownerId}`;
    moved.set(pair, { to: assign.ownerId, from: it.ownerId, names: [...(moved.get(pair)?.names ?? []), it.message.fromName] });
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
  const events: NewEvent[] = [];
  for (const { to, from, names } of moved.values()) {
    const n = names.length;
    events.push({ key: `moved:${to}:${from}:${at}`, at, kind: "moved_to_you", group: "changed", to, title: `${n} conversation${n === 1 ? "" : "s"} moved to you`, detail: `From ${staffById(from)?.name ?? from} at ${reason}: ${names.slice(0, 3).join(", ")}${n > 3 ? ` and ${n - 3} more` : ""}` });
  }
  for (const [from, names] of stuck) {
    const n = names.length;
    for (const to of ["role:senior", "role:manager"]) {
      events.push({ key: `stuck:${from}:${at}:${to}`, at, kind: "stuck_handover", group: "needs", to, title: `${n} conversation${n === 1 ? "" : "s"} stuck with ${staffById(from)?.name ?? from}`, detail: `Off shift and nobody of the same role is on. ${names.slice(0, 3).join(", ")}${n > 3 ? ` and ${n - 3} more` : ""}` });
    }
  }
  return withEvents({ ...state, items, rotation, handovers }, events);
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
      const replied = guestRepliedEvents(state, action.message, receivedAt);
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
        return withEvents(
          {
            ...state,
            items: {
              ...state.items,
              [action.message.id]: item,
            },
            order: [action.message.id, ...state.order],
            selectedId: action.message.id,
            rotation: assign.rotation,
          },
          [...replied, ...managerEvents(action.message, p.triage.summary, queue, nowIso)],
        );
      }
      return withEvents(
        {
          ...state,
          items: {
            ...state.items,
            [action.message.id]: { message: action.message, receivedAt, status: "new", ownerId: null, queue: "agent", important: [] },
          },
          order: [action.message.id, ...state.order],
          selectedId: action.message.id,
        },
        replied,
      );
    }
    case "restore_message": {
      if (state.items[action.message.id]) return state;
      const m = action.message;
      const auto = !!m.gmail?.autoReplied;
      const stub: AnalysisResult = {
        engine: "rules",
        latencyMs: 0,
        proposal: {
          triage: { category: auto ? "pre_arrival_question" : "other", secondaryCategories: [], hotelId: null, urgency: "normal", language: "en", summary: "Restored from the mailbox after the desk was cleared; the original sorting is not kept there." },
          bookingMatch: { bookingId: m.bookingRef ?? null, confidence: m.bookingRef ? "high" : "none", note: m.bookingRef ? "Reference carried by the message." : "Not re-sorted." },
          sensitiveData: { present: false, types: [], handling: "Not re-checked; the reply had already gone out." },
          actions: [],
          draftReply: action.reply.body,
          didNotPromise: [],
          policyCitations: [],
          confidence: 0,
          autoSendEligible: false,
          autoSend: auto ? { kind: "policy_answer", reason: "Sent alone before the desk was rebuilt.", body: action.reply.body } : { kind: "none", reason: "" },
          requiresHuman: true,
          requiresHumanReason: "Already answered.",
        },
      };
      const item: InboxItem = {
        message: m,
        receivedAt: action.receivedAt,
        status: auto ? "auto_sent" : "sent",
        analysis: stub,
        draft: action.reply.body,
        approved: [],
        ownerId: auto ? AI_OWNER_ID : null,
        ownerRule: "Restored from the mailbox.",
        queue: auto ? "auto" : "agent",
        important: [],
        handledAt: action.reply.at,
        handledBy: auto ? AI_OWNER_ID : MAILBOX_OWNER_ID,
        autoSentAt: auto ? action.reply.at : undefined,
        autoSentBody: auto ? action.reply.body : undefined,
        delivery: auto ? { via: "gmail", at: action.reply.at } : undefined,
        result: auto ? undefined : { sentReply: { channel: "email", to: m.from, body: action.reply.body, sentAt: action.reply.at, deliveredVia: "gmail" }, traces: [], bookingUpdates: [], handoffs: [], paymentLinks: [], skipped: [] },
      };
      return { ...state, items: { ...state.items, [m.id]: item }, order: [...state.order, m.id] };
    }
    case "delivered": {
      const next = patch(state, action.id, { delivery: action.delivery });
      if (!action.delivery.error) return next;
      // The AI agent owns auto-sent items, so a failed one goes to the seniors and managers.
      return withEvents(next, deliveryFailedEvents(next.items[action.id], ["role:senior", "role:manager"], action.delivery.error, action.delivery.at));
    }
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
      return withEvents({ ...next, rotation: assign.rotation }, managerEvents(item.message, p.triage.summary, queue, nowIso));
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
      const nowIso = new Date().toISOString();
      const next = {
        ...patch(state, action.id, { status: action.status, result: action.result, handledAt: nowIso, handledBy: action.by, edited }),
        traces: [...state.traces, ...action.result.traces],
        handoffs: [...state.handoffs, ...action.result.handoffs],
        bookingUpdates: [...state.bookingUpdates, ...action.result.bookingUpdates],
      };
      const err = action.result.sentReply?.deliveryError;
      return err ? withEvents(next, deliveryFailedEvents(next.items[action.id], [action.by], err, nowIso)) : next;
    }
    case "trace_status":
      return { ...state, traces: state.traces.map((t) => (t.id === action.traceId ? { ...t, status: action.status } : t)) };
    case "override_type":
      return patch(state, action.id, { typeOverride: action.category });
    case "reassign": {
      const it = state.items[action.id];
      if (!it || it.ownerId === action.ownerId) return state;
      const byName = action.by ? (staffById(action.by)?.name ?? action.by) : "a senior or manager";
      const reason = `Reassigned by ${byName}`;
      const at = new Date().toISOString();
      const next = patch(state, action.id, {
        ownerId: action.ownerId,
        ownerRule: `${reason}.`,
        important: it.important.filter((r) => r !== NOBODY_TO_HAND_TO),
        ownerHistory: [...(it.ownerHistory ?? []), { from: it.ownerId, to: action.ownerId, at, reason }],
      });
      // Taking a conversation yourself is not news to you.
      if (action.by === action.ownerId || action.ownerId === AI_OWNER_ID) return next;
      return withEvents(next, [{ key: `moved:${action.id}:${at}`, at, kind: "moved_to_you", group: "changed", to: action.ownerId, title: `Moved to you by ${byName}`, detail: `${it.message.fromName}${catLabel(it)}`, itemId: action.id }]);
    }
    case "resend_result": {
      const it = state.items[action.id];
      if (!it) return state;
      const delivery = { via: "gmail" as const, at: action.at, error: action.ok ? undefined : action.error ?? "send failed" };
      const next = it.result?.sentReply
        ? patch(state, action.id, {
            result: { ...it.result, sentReply: { ...it.result.sentReply, body: action.body, sentAt: action.ok ? action.at : it.result.sentReply.sentAt, deliveredVia: action.ok ? "gmail" : undefined, deliveryError: action.ok ? undefined : action.error ?? "send failed" } },
            handledBy: action.ok ? action.by : it.handledBy,
            edited: it.edited || action.body !== it.result.sentReply.body,
          })
        : patch(state, action.id, { delivery, autoSentBody: action.ok ? action.body : it.autoSentBody, handledBy: action.ok ? action.by : it.handledBy });
      return action.ok ? next : withEvents(next, deliveryFailedEvents(next.items[action.id], [action.by], delivery.error ?? "send failed", action.at));
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
      let next = state;
      if (ended.length) {
        const overrides: ShiftOverrides = { ...state.shiftOverrides };
        for (const s of ended) overrides[s.id] = "off";
        next = handoverFrom({ ...state, shiftOverrides: overrides }, ended.map((s) => s.id), now, "shift end");
      }
      return withEvents(next, tickEvents(next, now));
    }
    case "notifications_seen":
      return { ...state, notificationsSeenAt: { ...state.notificationsSeenAt, [action.staffId]: new Date().toISOString() } };
    case "list_opened": {
      const cur = state.listSeen[action.staffId];
      // An immediate re-open (React strict mode remounts in development) is not a return.
      const away = cur?.awayAt && Date.now() - Date.parse(cur.awayAt) > 2000 ? cur.awayAt : null;
      return { ...state, listSeen: { ...state.listSeen, [action.staffId]: { newSince: away ?? cur?.newSince ?? null, awayAt: null } } };
    }
    case "list_left": {
      const cur = state.listSeen[action.staffId];
      return { ...state, listSeen: { ...state.listSeen, [action.staffId]: { newSince: cur?.newSince ?? null, awayAt: action.at } } };
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
    if (!state.hydrated || !state.session || busy.current) return;
    const nextId = state.order.find((id) => state.items[id].status === "new" && !state.items[id].error);
    if (!nextId) return;
    busy.current = true;
    const item = state.items[nextId];
    dispatch({ type: "analyzing", id: nextId });
    // Sample messages are sorted by the rules engine so the model quota is kept for real mail.
    fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: item.message, engine: isSample(nextId) ? "rules" : undefined }) })
      .then(async (r) => {
        if (r.status === 401) {
          dispatch({ type: "logout" });
          throw new Error("Signed out. Sign in again to sort this message.");
        }
        if (!r.ok) throw new Error(`Analyse failed (${r.status})`);
        dispatch({ type: "analyzed", id: nextId, analysis: (await r.json()) as AnalysisResult });
      })
      .catch((e) => dispatch({ type: "analyze_failed", id: nextId, error: e instanceof Error ? e.message : String(e) }))
      .finally(() => {
        busy.current = false;
      });
  }, [state.hydrated, state.session, state.order, state.items]);

  // Shift ends: once a minute, hand over the items of anyone whose window has closed.
  useEffect(() => {
    if (!state.hydrated) return;
    const tick = () => dispatch({ type: "shift_tick", now: new Date().toISOString() });
    tick();
    const t = setInterval(tick, 60000);
    return () => clearInterval(t);
  }, [state.hydrated]);

  // Live Gmail: pull new mail every 20 seconds while a signed-in tab is open.
  useEffect(() => {
    if (!state.hydrated || !state.session) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/gmail/poll");
        if (r.status === 401) {
          dispatch({ type: "logout" });
          return;
        }
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
  }, [state.hydrated, state.session]);

  // Live Gmail: what the AI agent sends alone really goes out, once, to the sender.
  const sending = useRef(new Set<string>());
  useEffect(() => {
    if (!state.hydrated || !state.session) return;
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
  }, [state.hydrated, state.session, state.order, state.items]);

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
