"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { InboxList } from "@/components/desk/InboxList";
import { MessageView } from "@/components/desk/MessageView";
import { ProposalPanel } from "@/components/desk/ProposalPanel";
import { Compose } from "@/components/desk/Compose";

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-stone-500">{label}</div>
      <div className="text-lg font-semibold leading-tight">{value}</div>
      {hint ? <div className="text-[11px] text-stone-500">{hint}</div> : null}
    </div>
  );
}

export default function Desk() {
  const { state, dispatch } = useStore();
  const [composing, setComposing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const item = state.selectedId ? state.items[state.selectedId] : undefined;

  const handled = state.order.map((id) => state.items[id]).filter((i) => i.handledAt);
  const waiting = state.order.map((id) => state.items[id]).filter((i) => !i.handledAt);
  const oldestWaitMin = waiting.length ? Math.max(...waiting.map((i) => (now - Date.parse(i.receivedAt)) / 60000)) : 0;
  const avgHandle = handled.length ? handled.reduce((s, i) => s + (Date.parse(i.handledAt!) - Date.parse(i.receivedAt)) / 60000, 0) / handled.length : 0;
  const tracesCreated = state.traces.length;
  const sensitiveTraces = state.traces.filter((t) => t.sensitive).length;
  const autoEligible = state.order.filter((id) => state.items[id].analysis?.proposal.autoSendEligible).length;

  if (!state.hydrated) return <div className="p-6 text-sm text-stone-500">Loading…</div>;

  return (
    <div className="flex-1 flex min-h-0">
      <InboxList onCompose={() => setComposing(true)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="border-b border-stone-200 bg-white/60 flex flex-wrap items-stretch divide-x divide-stone-200">
          <Metric label="Waiting" value={String(waiting.length)} hint={waiting.length ? `oldest ${Math.round(oldestWaitMin)} min` : "inbox clear"} />
          <Metric label="Handled" value={String(handled.length)} hint={handled.length ? `avg ${Math.round(avgHandle)} min to reply` : "baseline 9h median"} />
          <Metric label="Traces created" value={String(tracesCreated)} hint={sensitiveTraces ? `${sensitiveTraces} restricted` : "requests now structured"} />
          <Metric label="Auto-send eligible" value={String(autoEligible)} hint="phase 2 candidates" />
          <div className="ml-auto flex items-center px-3">
            <button onClick={() => dispatch({ type: "reset" })} className="text-xs text-stone-500 hover:underline">
              Reset demo
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
          <div className="mx-auto max-w-[1240px] p-4 grid grid-cols-1 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-4 items-start">
            <div className="space-y-4">
              {composing ? <Compose onClose={() => setComposing(false)} /> : null}
              {item ? <MessageView item={item} /> : <div className="text-sm text-stone-500">Select a message.</div>}
            </div>
            <div>{item ? <ProposalPanel key={item.message.id} item={item} /> : null}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
