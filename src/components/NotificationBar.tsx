"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { isPending, useStore } from "@/lib/store";
import { ownerName } from "@/lib/desk/roster";
import { getHotel } from "@/lib/pms";

export function NotificationBar() {
  const { state, dispatch } = useStore();
  const router = useRouter();
  const pathname = usePathname();
  const [dismissedKeys, setDismissedKeys] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  if (!state.hydrated || !state.session) return null;

  // 1. Check for SLA breaches (>60 mins waiting)
  const slaBreaches = state.order
    .map((id) => state.items[id])
    .filter((it) => it && isPending(it))
    .map((it) => {
      const ageMin = Math.round((now - Date.parse(it.receivedAt)) / 60000);
      return { it, ageMin };
    })
    .filter(({ ageMin }) => ageMin >= 60)
    .sort((a, b) => b.ageMin - a.ageMin);

  // 2. Check for recent inbound messages (within 5 minutes, still pending)
  const recentInbounds = state.order
    .map((id) => state.items[id])
    .filter((it) => it && isPending(it))
    .map((it) => {
      const ageMin = Math.round((now - Date.parse(it.receivedAt)) / 60000);
      return { it, ageMin };
    })
    .filter(({ ageMin }) => ageMin < 5)
    .sort((a, b) => a.ageMin - b.ageMin);

  // 3. Check for recent autonomous AI replies (within 10 minutes)
  const recentAutoReplies = state.order
    .map((id) => state.items[id])
    .filter((it) => it && it.autoSentAt)
    .map((it) => {
      const ageMin = Math.round((now - Date.parse(it.autoSentAt!)) / 60000);
      return { it, ageMin };
    })
    .filter(({ ageMin }) => ageMin < 10)
    .sort((a, b) => a.ageMin - b.ageMin);

  // Determine active notification banner
  let activeNotification: {
    key: string;
    type: "sla" | "inbound" | "auto";
    title: string;
    message: string;
    itemId?: string;
    actionLabel?: string;
  } | null = null;

  if (slaBreaches.length > 0) {
    const oldest = slaBreaches[0];
    const key = `sla-${oldest.it.message.id}-${Math.floor(oldest.ageMin / 15)}`;
    if (!dismissedKeys[key]) {
      const count = slaBreaches.length;
      activeNotification = {
        key,
        type: "sla",
        title: "SLA Attention Required",
        message:
          count === 1
            ? `${oldest.it.message.fromName}'s inquiry has been waiting for ${Math.floor(oldest.ageMin / 60)}h ${oldest.ageMin % 60 ? `${oldest.ageMin % 60}m` : ""} without a reply.`
            : `${count} conversations have exceeded the 1-hour response window (oldest: ${oldest.it.message.fromName}, ${Math.floor(oldest.ageMin / 60)}h ${oldest.ageMin % 60 ? `${oldest.ageMin % 60}m` : ""}).`,
        itemId: oldest.it.message.id,
        actionLabel: "Review conversation",
      };
    }
  } else if (recentInbounds.length > 0) {
    const newest = recentInbounds[0];
    const key = `inbound-${newest.it.message.id}`;
    if (!dismissedKeys[key]) {
      const p = newest.it.analysis?.proposal;
      const hotel = p?.triage.hotelId ? getHotel(p.triage.hotelId) : undefined;
      const owner = ownerName(newest.it.ownerId);
      activeNotification = {
        key,
        type: "inbound",
        title: "New Inbound Inquiry",
        message: `${newest.it.message.fromName} (${hotel ? hotel.name.replace(/^Aurel /, "") : "General"}) · AI assigned to ${owner}.`,
        itemId: newest.it.message.id,
        actionLabel: "Open",
      };
    }
  } else if (recentAutoReplies.length > 0) {
    const newest = recentAutoReplies[0];
    const key = `auto-${newest.it.message.id}`;
    if (!dismissedKeys[key]) {
      const p = newest.it.analysis?.proposal;
      const hotel = p?.triage.hotelId ? getHotel(p.triage.hotelId) : undefined;
      activeNotification = {
        key,
        type: "auto",
        title: "Autonomous AI Reply Sent",
        message: `Policy inquiry from ${newest.it.message.fromName} (${hotel ? hotel.name.replace(/^Aurel /, "") : "Aurel"}) was answered automatically by the AI agent.`,
        itemId: newest.it.message.id,
        actionLabel: "Inspect thread",
      };
    }
  }

  if (!activeNotification) return null;

  const handleAction = () => {
    if (activeNotification?.itemId) {
      dispatch({ type: "select", id: activeNotification.itemId });
      if (pathname !== "/") {
        router.push("/");
      }
    }
  };

  const handleDismiss = () => {
    if (activeNotification) {
      setDismissedKeys((prev) => ({ ...prev, [activeNotification.key]: true }));
    }
  };

  const isSla = activeNotification.type === "sla";
  const isAuto = activeNotification.type === "auto";

  return (
    <div
      role="region"
      aria-label="Desk notifications"
      className={`px-4 py-2 border-b flex items-center justify-between gap-4 text-xs transition-colors duration-200 z-10 ${
        isSla
          ? "bg-rose-50/90 border-rose-200 text-rose-900"
          : isAuto
            ? "bg-emerald-50/90 border-emerald-200 text-emerald-950"
            : "bg-amber-50/90 border-amber-200 text-amber-950"
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={`h-2 w-2 rounded-full shrink-0 ${
            isSla ? "bg-rose-600 animate-pulse" : isAuto ? "bg-emerald-600" : "bg-amber-500 animate-pulse"
          }`}
        />
        <span className="font-semibold shrink-0">{activeNotification.title}:</span>
        <span className="truncate">{activeNotification.message}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {activeNotification.actionLabel ? (
          <button
            onClick={handleAction}
            className={`font-medium underline underline-offset-2 hover:opacity-80 transition ${
              isSla ? "text-rose-900" : isAuto ? "text-emerald-900" : "text-amber-950"
            }`}
          >
            {activeNotification.actionLabel} &rarr;
          </button>
        ) : null}
        <button
          onClick={handleDismiss}
          className="text-stone-400 hover:text-stone-700 p-0.5 rounded transition text-sm leading-none"
          title="Dismiss notification"
          aria-label="Dismiss notification"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
