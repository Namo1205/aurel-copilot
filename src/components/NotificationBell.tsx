"use client";

// The bell in the header. Shows only what the conversation list cannot: changes
// made to your work while you were not looking, and anything that failed. New
// arrivals are not here; the list is the inbox. Read state is per person.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { eventsFor, unreadEvents, useStore, type DeskEvent, type EventGroup } from "@/lib/store";
import { timeAgo } from "@/components/ui";

const GROUP_LABEL: Record<EventGroup, string> = { needs: "Needs you", changed: "Changed", today: "Today" };
const GROUP_ORDER: EventGroup[] = ["needs", "changed", "today"];
const DOT: Record<EventGroup, string> = { needs: "bg-rose-500", changed: "bg-amber-400", today: "bg-stone-300" };
const WINDOW_MS = 7 * 24 * 3600000;

export function NotificationBell() {
  const { state, dispatch } = useStore();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const session = state.session;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Desktop alert for one thing only: a reply the guest did not receive, and only
  // while the tab is in the background. Everything else waits until you look.
  const alerted = useRef(new Set<string>());
  useEffect(() => {
    if (!session || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    for (const e of unreadEvents(state, session)) {
      if (e.kind !== "delivery_failed" || alerted.current.has(e.id)) continue;
      alerted.current.add(e.id);
      if (document.hidden) new Notification(e.title, { body: e.detail, tag: e.id });
    }
  }, [state, session]);

  if (!session) return null;

  const cutoff = now - WINDOW_MS;
  const all = eventsFor(state, session).filter((e) => Date.parse(e.at) > cutoff).slice(0, 60);
  const unread = unreadEvents(state, session);
  const seenAt = state.notificationsSeenAt[session.staffId];
  const isUnread = (e: DeskEvent) => !seenAt || Date.parse(e.at) > Date.parse(seenAt);
  const groups = GROUP_ORDER.map((g) => ({ g, list: all.filter((e) => e.group === g) })).filter((x) => x.list.length);
  const canAskDesktop = typeof Notification !== "undefined" && Notification.permission === "default";

  const openEvent = (e: DeskEvent) => {
    if (e.itemId && state.items[e.itemId]) dispatch({ type: "select", id: e.itemId });
    setOpen(false);
    router.push("/");
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread.length ? `, ${unread.length} unread` : ""}`}
        aria-expanded={open}
        title="Notifications"
        className={`relative h-8 w-8 grid place-items-center rounded-md transition ${open ? "bg-stone-100 text-stone-900" : "text-stone-500 hover:bg-stone-100 hover:text-stone-900"}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread.length ? (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-semibold grid place-items-center tabular-nums ring-2 ring-white">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 top-10 w-[400px] max-h-[70vh] flex flex-col rounded-xl border border-stone-200 bg-white shadow-lg z-30 text-sm">
          <header className="px-4 py-2.5 border-b border-stone-100 flex items-center shrink-0">
            <span className="font-semibold">Notifications</span>
            {unread.length ? (
              <button onClick={() => dispatch({ type: "notifications_seen", staffId: session.staffId })} className="ml-auto text-xs text-stone-500 hover:text-stone-900 underline underline-offset-2">
                Mark all read
              </button>
            ) : null}
          </header>
          <div className="overflow-y-auto scroll-thin">
            {groups.length === 0 ? (
              <p className="px-4 py-6 text-[13px] text-stone-500 leading-relaxed">
                Nothing needs you. New conversations go straight to your list; this is only for changes to your work and anything that failed.
              </p>
            ) : (
              groups.map(({ g, list }) => (
                <section key={g}>
                  <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-stone-400">{GROUP_LABEL[g]}</div>
                  <ul>
                    {list.map((e) => {
                      const fresh = isUnread(e);
                      return (
                        <li key={e.id}>
                          <button onClick={() => openEvent(e)} className={`w-full text-left px-4 py-2.5 flex gap-3 border-b border-stone-50 hover:bg-stone-50 ${fresh ? "bg-brand-soft/40" : ""}`}>
                            <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${DOT[g]} ${fresh ? "" : "opacity-40"}`} />
                            <span className="min-w-0 flex-1">
                              <span className={`block text-[13px] ${fresh ? "font-semibold text-stone-900" : "font-medium text-stone-700"}`}>{e.title}</span>
                              {e.detail ? <span className="block text-xs text-stone-500 truncate">{e.detail}</span> : null}
                            </span>
                            <span className="text-[11px] text-stone-400 tabular-nums shrink-0 mt-0.5">{timeAgo(e.at)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}
          </div>
          {canAskDesktop ? (
            <footer className="px-4 py-2 border-t border-stone-100 shrink-0">
              <button onClick={() => void Notification.requestPermission()} className="text-xs text-stone-500 hover:text-stone-900 underline underline-offset-2">
                Desktop alert when a reply fails to send
              </button>
            </footer>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
