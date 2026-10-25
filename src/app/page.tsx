"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useSearchParams } from "next/navigation";
import { isPending, useSessionGuard, useStore, type Prefs } from "@/lib/store";
import { ConversationList } from "@/components/desk/ConversationList";
import { Thread } from "@/components/desk/Thread";
import { ContextPanel } from "@/components/desk/ContextPanel";
import { Compose } from "@/components/desk/Compose";
import { NavRail } from "@/components/desk/NavRail";
import { useMediaQuery } from "@/components/ui";
import { conversationKey, conversationsFor, viewsFor, type View, type ViewId } from "@/lib/desk/visibility";
import { ROSTER, isOnShift } from "@/lib/desk/roster";

// The conversation list can be dragged between these widths; double-click resets.
const LIST_MIN = 260;
const LIST_MAX = 480;
const LIST_DEFAULT = 320;
const clampWidth = (w: number) => Math.min(LIST_MAX, Math.max(LIST_MIN, Math.round(w)));

export default function Desk() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-stone-500">Loading…</div>}>
      <DeskInner />
    </Suspense>
  );
}

// Deep links: /?tab=auto&item=m-013 opens that view and the conversation holding that message.
function DeskInner() {
  const session = useSessionGuard();
  const { state, dispatch } = useStore();
  const params = useSearchParams();
  const linkedTab = params.get("tab") as ViewId | null;
  const linkedItem = params.get("item");
  const wantSamples = params.get("samples") === "load";
  useEffect(() => {
    if (linkedItem && state.hydrated && state.items[linkedItem]) dispatch({ type: "select", id: linkedItem });
  }, [linkedItem, state.hydrated, state.items, dispatch]);
  // /?samples=load puts the sample messages on the desk, for rehearsals and screenshots.
  useEffect(() => {
    if (wantSamples && state.hydrated && state.samples !== "loaded") dispatch({ type: "load_samples" });
  }, [wantSamples, state.hydrated, state.samples, dispatch]);
  const [composing, setComposing] = useState(false);
  const [viewId, setViewId] = useState<ViewId | null>(null);

  // "New since you last looked": the store records when this person left the list
  // (another page, background tab) and turns that into the divider when they return.
  const staffId = session?.staffId;
  useEffect(() => {
    if (!state.hydrated || !staffId) return;
    dispatch({ type: "list_opened", staffId });
    const onVisibility = () => {
      if (document.hidden) dispatch({ type: "list_left", staffId, at: new Date().toISOString() });
      else dispatch({ type: "list_opened", staffId });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      dispatch({ type: "list_left", staffId, at: new Date().toISOString() });
    };
  }, [state.hydrated, staffId, dispatch]);
  const newSince = staffId ? (state.listSeen[staffId]?.newSince ?? null) : null;
  const [focus, setFocus] = useState<string>(""); // seniors and managers: one agent's conversations
  const [now] = useState(() => new Date());

  // Layout preferences, remembered per person: rail collapsed, list width, details shown.
  const prefs: Prefs = (staffId && state.prefs[staffId]) || {};
  const setPref = (pref: Prefs) => staffId && dispatch({ type: "set_pref", staffId, pref });
  const railCollapsed = !!prefs.railCollapsed;
  const savedWidth = clampWidth(prefs.listWidth ?? LIST_DEFAULT);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const listWidth = dragWidth ?? savedWidth;
  const dragStart = useRef<{ x: number; w: number } | null>(null);
  const onHandleDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragStart.current = { x: e.clientX, w: listWidth };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStart.current) setDragWidth(clampWidth(dragStart.current.w + e.clientX - dragStart.current.x));
  };
  const onHandleUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    setPref({ listWidth: clampWidth(dragStart.current.w + e.clientX - dragStart.current.x) });
    dragStart.current = null;
    setDragWidth(null);
  };
  // Wide screens show the details panel beside the thread; narrow ones open it as a sheet.
  const isWide = useMediaQuery("(min-width: 1280px)");
  const [sheetOpen, setSheetOpen] = useState(false);
  const detailsShown = isWide ? !prefs.detailsHidden : sheetOpen;
  const toggleDetails = () => (isWide ? setPref({ detailsHidden: !prefs.detailsHidden }) : setSheetOpen((o) => !o));

  const all = useMemo(() => state.order.map((id) => state.items[id]), [state.order, state.items]);
  if (!state.hydrated || !session) return <div className="p-6 text-sm text-stone-500">Loading…</div>;

  const views = viewsFor(session.role);
  const view: View = views.find((v) => v.id === (viewId ?? linkedTab)) ?? views[0];
  const convs = conversationsFor(session, all, focus);
  const visible = convs.filter(view.filter);
  const counts = Object.fromEntries(views.map((v) => [v.id, v.id === "done" ? 0 : convs.filter(v.filter).length]));
  const selectedItem = state.selectedId ? state.items[state.selectedId] : undefined;
  const selectedKey = selectedItem ? conversationKey(selectedItem) : null;
  const conversation = visible.find((c) => c.key === selectedKey) ?? visible[0] ?? null;

  // Seniors and managers: the agents on shift or holding open items, with counts.
  const leads = session.role === "senior" || session.role === "manager";
  const team = leads
    ? ROSTER.filter((s) => s.role === "agent" && (isOnShift(s, now, state.shiftOverrides) || all.some((i) => i.ownerId === s.id && isPending(i)))).map((s) => ({
        s,
        open: all.filter((i) => i.ownerId === s.id && isPending(i)).length,
      }))
    : undefined;
  const myOpen = all.filter((i) => i.ownerId === session.staffId && isPending(i)).length;

  const sync = state.mailboxSync;
  const emptyText =
    all.length === 0 && state.gmail?.configured && sync.status === "running"
      ? `Loading the mailbox… ${sync.loaded}${sync.estimate ? ` of about ${sync.estimate}` : ""} so far.`
      : all.length === 0 && state.gmail?.configured && sync.status === "error"
        ? `The mailbox could not be loaded: ${sync.error ?? "unknown error"}. New mail still appears here within 20 seconds.`
        : all.length === 0 && state.gmail?.configured
          ? `No conversations yet. New mail to ${state.gmail.address} appears here within 20 seconds, sorted and owned.`
          : view.id === "done"
            ? "Nothing closed yet."
            : session.role === "agent"
              ? "Nothing waiting for you. New conversations assigned to you appear here."
              : "Nothing in this view.";

  return (
    <div className="flex-1 flex min-h-0">
      <NavRail
        views={views}
        counts={counts}
        activeId={view.id}
        onView={(v) => {
          setViewId(v.id);
          setComposing(false);
        }}
        team={team}
        me={session.staffId}
        myOpen={myOpen}
        focus={focus}
        onFocus={setFocus}
        collapsed={railCollapsed}
        onToggle={() => setPref({ railCollapsed: !railCollapsed })}
      />
      <div style={{ width: listWidth }} className="shrink-0 flex min-h-0">
        <ConversationList
          conversations={visible}
          title={view.label}
          count={counts[view.id]}
          selectedKey={conversation?.key ?? null}
          onSelect={(c) => {
            setComposing(false);
            dispatch({ type: "select", id: (c.open ?? c.latest).message.id });
          }}
          emptyText={emptyText}
          onCompose={leads ? () => setComposing(true) : undefined}
          newSince={newSince}
        />
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the conversation list"
        title="Drag to resize the list. Double-click to reset."
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
        onDoubleClick={() => setPref({ listWidth: LIST_DEFAULT })}
        className={`w-1.5 -ml-[3px] shrink-0 z-10 cursor-col-resize transition-colors ${dragWidth !== null ? "bg-brand/40" : "bg-transparent hover:bg-brand/30"}`}
      />
      {composing ? (
        <div className="flex-1 min-w-0 overflow-y-auto scroll-thin">
          <div className="mx-auto max-w-[760px] px-6 py-5">
            <Compose onClose={() => setComposing(false)} />
          </div>
        </div>
      ) : conversation ? (
        <>
          <Thread key={conversation.key} conversation={conversation} detailsShown={detailsShown} onToggleDetails={toggleDetails} />
          {isWide && detailsShown ? <ContextPanel conversation={conversation} variant="inline" /> : null}
          {!isWide && sheetOpen ? <ContextPanel conversation={conversation} variant="sheet" onClose={() => setSheetOpen(false)} /> : null}
        </>
      ) : (
        <div className="flex-1 grid place-items-center p-8 text-sm text-stone-500 text-center max-w-none">
          <div className="max-w-sm leading-relaxed">
            {emptyText}
            {leads ? (
              <div className="mt-3">
                <button onClick={() => setComposing(true)} className="text-brand underline">
                  Simulate a message
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
