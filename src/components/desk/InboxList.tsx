"use client";

import { useStore, type InboxItem } from "@/lib/store";
import { Badge, ChannelIcon, timeAgo } from "@/components/ui";
import { CATEGORY_LABEL } from "@/lib/agent/schema";
import { getHotel } from "@/lib/pms";
import { redactCards } from "@/lib/agent/rules";

function statusBadge(item: InboxItem) {
  switch (item.status) {
    case "new":
      return <Badge tone="amber">Needs reply</Badge>;
    case "analyzing":
      return <Badge tone="blue">Analysing…</Badge>;
    case "drafted":
      return <Badge tone="brand">Draft ready</Badge>;
    case "sent":
      return <Badge tone="green">Sent</Badge>;
    case "handed_off":
      return <Badge tone="stone">Handed off</Badge>;
  }
}

export function InboxList({ onCompose }: { onCompose: () => void }) {
  const { state, dispatch } = useStore();
  return (
    <aside className="w-[340px] shrink-0 border-r border-stone-200 bg-white flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-stone-100 flex items-center">
        <h2 className="font-semibold text-sm">Inbox</h2>
        <span className="ml-2 text-xs text-stone-500">{state.order.length} contacts</span>
        <button onClick={onCompose} className="ml-auto text-xs text-brand font-medium hover:underline">
          + New message
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto scroll-thin">
        {state.order.map((id) => {
          const item = state.items[id];
          const m = item.message;
          const p = item.analysis?.proposal;
          const hotel = p?.triage.hotelId ? getHotel(p.triage.hotelId) : undefined;
          const selected = state.selectedId === id;
          return (
            <li key={id}>
              <button
                onClick={() => dispatch({ type: "select", id })}
                className={`w-full text-left px-4 py-3 border-b border-stone-100 flex gap-3 transition ${
                  selected ? "bg-brand-soft/70" : "hover:bg-stone-50"
                }`}
              >
                <ChannelIcon channel={m.channel} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-sm truncate">{m.fromName}</span>
                    <span className="ml-auto text-xs text-stone-400 shrink-0">{timeAgo(item.receivedAt)}</span>
                  </div>
                  <div className="text-xs text-stone-600 truncate">{m.subject ?? redactCards(m.body)}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1 items-center">
                    {statusBadge(item)}
                    {p ? <Badge>{CATEGORY_LABEL[p.triage.category]}</Badge> : null}
                    {hotel ? <span className="text-[11px] text-stone-500">{hotel.name}</span> : null}
                    {p?.sensitiveData.present ? <Badge tone="rose">Sensitive</Badge> : null}
                    {p?.triage.urgency === "high" ? <Badge tone="rose">Urgent</Badge> : null}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
