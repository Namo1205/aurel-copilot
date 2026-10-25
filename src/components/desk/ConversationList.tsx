"use client";

import { useEffect, useState } from "react";
import { isPending, useStore } from "@/lib/store";
import { ChannelIcon, timeAgo } from "@/components/ui";
import { CATEGORY_LABEL } from "@/lib/agent/schema";
import { getHotel } from "@/lib/pms";
import { redactCards } from "@/lib/agent/rules";
import { ASSISTANT_NAME, ownerName } from "@/lib/desk/roster";
import type { Conversation } from "@/lib/desk/visibility";
import { PaperclipIcon } from "@/components/desk/Attachments";

export function ConversationList({
  conversations,
  title,
  count,
  selectedKey,
  onSelect,
  emptyText,
  onCompose,
  newSince,
}: {
  conversations: Conversation[];
  // The active view, chosen in the navigation rail.
  title: string;
  count?: number;
  selectedKey: string | null;
  onSelect: (c: Conversation) => void;
  emptyText: string;
  onCompose?: () => void;
  // ISO time the person last looked at the list; open conversations received after it get a divider.
  newSince?: string | null;
}) {
  const { state } = useStore();
  const [now, setNow] = useState(() => Date.now());
  const me = state.session?.staffId;
  const isNew = (c: Conversation) => !!newSince && !!c.open && Date.parse(c.open.receivedAt) > Date.parse(newSince);
  const firstNew = conversations.findIndex(isNew);
  const newCount = conversations.filter(isNew).length;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <aside className="w-full min-w-0 border-r border-stone-200 bg-white flex flex-col min-h-0">
      <div className="px-4 h-11 border-b border-stone-100 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-stone-900 truncate">{title}</h2>
        {count ? <span className="text-xs tabular-nums text-stone-400">{count}</span> : null}
        {onCompose ? (
          <button onClick={onCompose} className="ml-auto h-7 w-7 grid place-items-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-stone-900 text-lg leading-none" title="Add a simulated inbound email">
            +
          </button>
        ) : null}
      </div>
      <ul className="flex-1 overflow-y-auto scroll-thin">
        {conversations.length === 0 ? <li className="p-6 text-sm text-stone-500 leading-relaxed">{emptyText}</li> : null}
        {conversations.map((c, idx) => {
          const it = c.open ?? c.latest;
          const m = it.message;
          const p = it.analysis?.proposal;
          const cat = it.typeOverride ?? p?.triage.category;
          const hotel = p?.triage.hotelId ? getHotel(p.triage.hotelId) : undefined;
          const selected = selectedKey === c.key;
          const waiting = !!c.open;
          const ageMin = Math.round((now - Date.parse(it.receivedAt)) / 60000);
          const stale = waiting && ageMin > 120;
          const mine = it.ownerId === me;
          const preview = it.result?.sentReply && !waiting ? `You: ${it.result.sentReply.body}` : it.autoSentAt && !waiting ? `${ASSISTANT_NAME}: ${it.autoSentBody ?? ""}` : (m.subject ? `${m.subject} · ` : "") + redactCards(m.body);
          const meta = [cat ? CATEGORY_LABEL[cat] : null, hotel ? hotel.name.replace(/^Aurel /, "") : null, mine ? null : ownerName(it.ownerId), c.items.length > 1 ? `${c.items.length} messages` : null].filter(Boolean).join(" · ");
          return (
            <li key={c.key}>
              {idx === firstNew ? (
                <div className="flex items-center gap-2 px-3 py-1 text-[11px] text-brand">
                  <span className="flex-1 h-px bg-brand/30" />
                  New since {new Date(newSince!).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · {newCount}
                  <span className="flex-1 h-px bg-brand/30" />
                </div>
              ) : null}
              <button
                onClick={() => onSelect(c)}
                className={`w-full text-left pl-3 pr-4 py-3 border-b border-stone-100 border-l-[3px] flex gap-3 transition ${selected ? "bg-stone-50" : "hover:bg-stone-50/60"} ${
                  waiting && (it.important.length || ageMin >= 60)
                    ? "border-l-rose-500"
                    : waiting && ageMin >= 30
                      ? "border-l-amber-400"
                      : "border-l-transparent"
                }`}
              >
                <div className="relative shrink-0">
                  <ChannelIcon channel={m.channel} />
                  {waiting ? <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-white" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-sm truncate ${waiting ? "font-semibold text-stone-900" : "font-medium text-stone-600"}`}>{m.fromName}</span>
                    <div className="ml-auto flex items-center gap-1.5 shrink-0">
                      {waiting && ageMin >= 60 ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                          SLA {Math.floor(ageMin / 60)}h{ageMin % 60 ? ` ${ageMin % 60}m` : ""}
                        </span>
                      ) : waiting && ageMin >= 30 ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                          ⏳ {ageMin}m
                        </span>
                      ) : null}
                      <span className={`text-xs tabular-nums ${stale ? "text-rose-700 font-medium" : "text-stone-400"}`}>{timeAgo(c.lastActivity)}</span>
                    </div>
                  </div>
                  <div className={`text-[13px] truncate ${waiting ? "text-stone-800" : "text-stone-500"}`}>{preview.replace(/\s+/g, " ")}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-stone-500">
                    <span className="truncate">{meta || (isPending(it) ? "Sorting…" : "")}</span>
                    {p?.sensitiveData.present ? <span className="shrink-0 text-rose-700">· Sensitive</span> : null}
                    {m.attachments?.length ? (
                      <span className="shrink-0 text-stone-400 inline-flex items-center gap-0.5" title={m.attachments.map((a) => a.name).join(", ")}>
                        · <PaperclipIcon /> {m.attachments.length}
                      </span>
                    ) : null}
                    {it.status === "analyzing" || it.status === "new" ? <span className="ml-auto shrink-0 text-stone-400">Sorting…</span> : null}
                    {waiting && it.autoSentAt ? <span className="ml-auto shrink-0 text-amber-700">Needs decision</span> : null}
                    {!waiting && it.followUp && !it.followUp.sentAt && !it.followUp.dismissedAt ? <span className="ml-auto shrink-0 text-amber-700">Follow-up suggested</span> : null}
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
