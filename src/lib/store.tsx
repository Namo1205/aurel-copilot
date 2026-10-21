"use client";

// Client-side state for the prototype. Persisted to localStorage so a reviewer's
// session survives reloads and serverless cold starts. API routes are stateless.

import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import { SEED_MESSAGES, type InboundMessage } from "@/lib/inbox/seed";
import type { AnalysisResult } from "@/lib/agent";
import type { ExecutionResult, Handoff } from "@/lib/agent/execute";
import type { Booking, Trace } from "@/lib/pms";

export type ItemStatus = "new" | "analyzing" | "drafted" | "sent" | "handed_off";

export interface InboxItem {
  message: InboundMessage;
  receivedAt: string; // ISO, derived from receivedMinutesAgo at seed time
  status: ItemStatus;
  analysis?: AnalysisResult;
  error?: string;
  draft?: string;
  approved?: boolean[];
  result?: ExecutionResult;
  handledAt?: string;
}

export interface State {
  items: Record<string, InboxItem>;
  order: string[];
  traces: Trace[];
  handoffs: Handoff[];
  bookingUpdates: Booking[];
  selectedId: string | null;
  hydrated: boolean;
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
  | { type: "executed"; id: string; result: ExecutionResult; status: ItemStatus }
  | { type: "trace_status"; traceId: string; status: Trace["status"] }
  | { type: "reset" };

const KEY = "aurel-copilot-state-v1";

const EMPTY: State = { items: {}, order: [], traces: [], handoffs: [], bookingUpdates: [], selectedId: null, hydrated: false };

function seedState(): State {
  const now = Date.now();
  const items: Record<string, InboxItem> = {};
  for (const m of SEED_MESSAGES) {
    items[m.id] = { message: m, receivedAt: new Date(now - m.receivedMinutesAgo * 60000).toISOString(), status: "new" };
  }
  return {
    items,
    order: SEED_MESSAGES.map((m) => m.id),
    traces: [],
    handoffs: [],
    bookingUpdates: [],
    selectedId: SEED_MESSAGES[0].id,
    hydrated: false,
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "hydrate":
      return { ...state, ...action.state, hydrated: true };
    case "select":
      return { ...state, selectedId: action.id };
    case "add_message":
      return {
        ...state,
        items: { ...state.items, [action.message.id]: { message: action.message, receivedAt: new Date().toISOString(), status: "new" } },
        order: [action.message.id, ...state.order],
        selectedId: action.message.id,
      };
    case "analyzing":
      return patch(state, action.id, { status: "analyzing", error: undefined });
    case "analyzed":
      return patch(state, action.id, {
        status: "drafted",
        analysis: action.analysis,
        draft: action.analysis.proposal.draftReply,
        approved: action.analysis.proposal.actions.map(() => true),
      });
    case "analyze_failed":
      return patch(state, action.id, { status: "new", error: action.error });
    case "set_draft":
      return patch(state, action.id, { draft: action.draft });
    case "toggle_action": {
      const item = state.items[action.id];
      const approved = [...(item.approved ?? [])];
      approved[action.index] = !approved[action.index];
      return patch(state, action.id, { approved });
    }
    case "executed":
      return {
        ...patch(state, action.id, { status: action.status, result: action.result, handledAt: new Date().toISOString() }),
        traces: [...state.traces, ...action.result.traces],
        handoffs: [...state.handoffs, ...action.result.handoffs],
        bookingUpdates: [...state.bookingUpdates, ...action.result.bookingUpdates],
      };
    case "trace_status":
      return { ...state, traces: state.traces.map((t) => (t.id === action.traceId ? { ...t, status: action.status } : t)) };
    case "reset":
      return { ...seedState(), hydrated: true };
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
        // Reset anything stuck mid-analysis from a previous session.
        if (saved.items) for (const it of Object.values(saved.items)) if (it.status === "analyzing") it.status = "new";
        dispatch({ type: "hydrate", state: saved });
      } else {
        dispatch({ type: "hydrate", state: seedState() });
      }
    } catch {
      dispatch({ type: "hydrate", state: seedState() });
    }
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    const { hydrated: _h, ...rest } = state;
    void _h;
    localStorage.setItem(KEY, JSON.stringify(rest));
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore outside StoreProvider");
  return ctx;
}
