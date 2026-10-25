"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isPending, useStore } from "@/lib/store";
import { NotificationBell } from "@/components/NotificationBell";
import { ProfileMenu } from "@/components/ProfileMenu";

interface Health {
  engine: string;
  model: string | null;
  used?: number;
  capacity?: number;
  usage?: { model: string; used: number; limit: number }[];
}

export function Nav() {
  const path = usePathname();
  const { state } = useStore();
  const [health, setHealth] = useState<Health | null>(null);
  const gmail = state.gmail;

  useEffect(() => {
    const load = () =>
      fetch("/api/health")
        .then((r) => r.json())
        .then(setHealth)
        .catch(() => setHealth({ engine: "rules", model: null }));
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  // One status for the whole desk: the mailbox and what sorts the mail, in plain words.
  // The detail that only matters when something is wrong lives in the tooltip.
  const live = health?.engine === "gemini";
  const used = health?.used ?? 0;
  const capacity = health?.capacity ?? 0;
  const nearLimit = live && capacity > 0 && used / capacity >= 0.8;
  let dot = "bg-stone-300";
  let label = "Demo";
  if (gmail?.configured) {
    if (gmail.error || !gmail.address) {
      dot = "bg-rose-500";
      label = "Mailbox not reachable";
    } else if (!gmail.send) {
      dot = "bg-amber-400";
      label = "Mailbox read only";
    } else if (!live) {
      dot = "bg-amber-400";
      label = "Live · rules only";
    } else if (nearLimit) {
      dot = "bg-amber-400";
      label = `Live · ${used} of ${capacity} requests used`;
    } else {
      dot = "bg-emerald-500";
      label = "Live";
    }
  } else if (health && !live) {
    dot = "bg-amber-400";
    label = "Demo · rules only";
  }
  const statusTip = [
    gmail?.configured ? (gmail.address ? `Mailbox: ${gmail.address}${gmail.send ? ", sending on." : ", read only."}` : `Mailbox: ${gmail.error ?? "not reachable."}`) : "No mailbox connected: the desk shows the sample messages.",
    live
      ? `Aurel Assistant sorts and drafts with the language model. Requests since the server started, per model (free tier allows ${health?.usage?.[0]?.limit ?? 20} a day each): ${(health?.usage ?? []).map((u) => `${u.model} ${u.used}/${u.limit}`).join(" · ")}. When every model is used up the rules engine takes over and says so on each item.`
      : "Aurel Assistant is on the deterministic rules engine: no model key set, or every model used up for the day. Nothing is lost; drafts are plainer.",
  ].join("\n");

  const openTraces = state.traces.filter((t) => t.status !== "done").length;
  const pending = state.order.filter((id) => isPending(state.items[id])).length;
  const sync = state.mailboxSync;

  const tab = (href: string, label: string, count?: number) => {
    const on = path === href;
    return (
      <Link href={href} className={`relative px-3 h-14 flex items-center text-sm whitespace-nowrap transition ${on ? "text-stone-900 font-medium" : "text-stone-500 hover:text-stone-900"}`}>
        {label}
        {count ? <span className={`ml-1.5 text-xs tabular-nums ${on ? "text-stone-500" : "text-stone-400"}`}>{count}</span> : null}
        {on ? <span className="absolute left-2 right-2 bottom-0 h-0.5 bg-brand rounded-full" /> : null}
      </Link>
    );
  };

  return (
    <header className="border-b border-stone-200 bg-white sticky top-0 z-20">
      <div className="px-4 h-14 flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2 whitespace-nowrap shrink-0">
          <span className="h-7 w-7 rounded-md bg-brand text-white grid place-items-center font-semibold text-sm">A</span>
          <span className="font-semibold tracking-tight">Aurel Reservations</span>
        </Link>
        {state.session ? (
          <nav className="flex items-center whitespace-nowrap">
            {tab("/", "Desk", pending)}
            {tab("/dashboard", "Dashboard")}
            {tab("/ops", "PMS traces", openTraces)}
            {tab("/about", "Help")}
          </nav>
        ) : null}
        <div className="ml-auto flex items-center gap-4 text-sm">
          {sync.status === "running" ? (
            <span className="flex items-center gap-1.5 text-xs text-stone-500 whitespace-nowrap" title="Loading every conversation in the mailbox into this browser. Answered ones come back closed with their reply; unanswered ones are sorted and owned.">
              <span className="h-3 w-3 rounded-full border-2 border-stone-300 border-t-brand animate-spin" />
              Loading mailbox{sync.loaded ? ` · ${sync.loaded}${sync.estimate ? ` of about ${sync.estimate}` : ""}` : "…"}
            </span>
          ) : sync.status === "error" ? (
            <span className="flex items-center gap-1.5 text-xs text-rose-700 whitespace-nowrap" title={sync.error}>
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              Mailbox could not be loaded
            </span>
          ) : null}
          {health || gmail ? (
            <span className="flex items-center gap-1.5 text-xs text-stone-500 whitespace-nowrap" title={statusTip}>
              <span className={`h-2 w-2 rounded-full ${dot}`} />
              {label}
            </span>
          ) : null}
          {state.session ? <NotificationBell /> : null}
          {state.session ? <ProfileMenu /> : null}
        </div>
      </div>
    </header>
  );
}
