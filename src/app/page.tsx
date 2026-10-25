"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { isPending, useSessionGuard, useStore } from "@/lib/store";
import { ConversationList } from "@/components/desk/ConversationList";
import { Thread } from "@/components/desk/Thread";
import { ContextPanel } from "@/components/desk/ContextPanel";
import { Compose } from "@/components/desk/Compose";
import { conversationKey, conversationsFor, viewsFor, type View, type ViewId } from "@/lib/desk/visibility";
import { ROSTER, isOnShift } from "@/lib/desk/roster";
import { restoreFromMailbox } from "@/lib/desk/restore";

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
  const [reloadNote, setReloadNote] = useState<string | null>(null);

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
  const [focus, setFocus] = useState<string>(""); // seniors: one agent's conversations
  const [now] = useState(() => new Date());

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

  // Seniors: a rail of agents on shift with open counts.
  const team =
    session.role === "senior"
      ? ROSTER.filter((s) => s.role === "agent" && (isOnShift(s, now, state.shiftOverrides) || all.some((i) => i.ownerId === s.id && isPending(i)))).map((s) => ({
          s,
          open: all.filter((i) => i.ownerId === s.id && isPending(i)).length,
        }))
      : [];

  const emptyText =
    all.length === 0 && state.gmail?.configured
      ? `No conversations yet. New mail to ${state.gmail.address} appears here within 20 seconds, sorted and owned.`
      : view.id === "done"
        ? "Nothing closed yet."
        : session.role === "agent"
          ? "Nothing waiting for you. New conversations assigned to you appear here."
          : "Nothing in this view.";

  return (
    <div className="flex-1 flex min-h-0">
      {team.length ? (
        <nav className="w-[180px] shrink-0 border-r border-stone-200 bg-stone-50 flex flex-col min-h-0 text-sm">
          <div className="px-3 h-11 flex items-center text-[11px] uppercase tracking-wide text-stone-400 border-b border-stone-100">Team</div>
          <ul className="flex-1 overflow-y-auto scroll-thin py-1">
            <li>
              <button onClick={() => setFocus("")} className={`w-full text-left px-3 py-1.5 flex items-center ${focus === "" ? "bg-white font-medium text-stone-900" : "text-stone-600 hover:bg-white/60"}`}>
                Everyone
              </button>
            </li>
            <li>
              <button onClick={() => setFocus(session.staffId)} className={`w-full text-left px-3 py-1.5 flex items-center ${focus === session.staffId ? "bg-white font-medium text-stone-900" : "text-stone-600 hover:bg-white/60"}`}>
                Me
                <span className="ml-auto text-xs tabular-nums text-stone-400">{all.filter((i) => i.ownerId === session.staffId && isPending(i)).length || ""}</span>
              </button>
            </li>
            {team.map(({ s, open }) => (
              <li key={s.id}>
                <button onClick={() => setFocus(s.id)} className={`w-full text-left px-3 py-1.5 flex items-center ${focus === s.id ? "bg-white font-medium text-stone-900" : "text-stone-600 hover:bg-white/60"}`}>
                  <span className="truncate">{s.name.split(" ")[0]}</span>
                  <span className={`ml-auto text-xs tabular-nums ${open >= 5 ? "text-rose-700 font-medium" : "text-stone-400"}`}>{open || ""}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <ConversationList
        conversations={visible}
        views={views}
        view={view}
        onView={(v) => {
          setViewId(v.id);
          setComposing(false);
        }}
        selectedKey={conversation?.key ?? null}
        onSelect={(c) => {
          setComposing(false);
          dispatch({ type: "select", id: (c.open ?? c.latest).message.id });
        }}
        counts={counts}
        emptyText={emptyText}
        onCompose={session.role === "manager" || session.role === "senior" ? () => setComposing(true) : undefined}
        newSince={newSince}
      />
      {composing ? (
        <div className="flex-1 min-w-0 overflow-y-auto scroll-thin">
          <div className="mx-auto max-w-[760px] px-6 py-5">
            <Compose onClose={() => setComposing(false)} />
          </div>
        </div>
      ) : conversation ? (
        <>
          <Thread key={conversation.key} conversation={conversation} />
          <ContextPanel conversation={conversation} />
        </>
      ) : (
        <div className="flex-1 grid place-items-center p-8 text-sm text-stone-500 text-center max-w-none">
          <div className="max-w-sm leading-relaxed">
            {emptyText}
            {state.gmail?.configured && all.length === 0 ? (
              <div className="mt-3">
                <button
                  onClick={() => {
                    setReloadNote("Reading the mailbox…");
                    restoreFromMailbox(dispatch)
                      .then((r) => setReloadNote(`${r.closed} answered restored, ${r.reopened} reopened.`))
                      .catch((e) => setReloadNote(e instanceof Error ? e.message : String(e)));
                  }}
                  className="text-brand underline"
                >
                  Reload the last three days from the mailbox
                </button>
                {reloadNote ? <div className="mt-1 text-xs text-stone-500">{reloadNote}</div> : null}
              </div>
            ) : null}
            {session.role === "manager" || session.role === "senior" ? (
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
