"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";

export function Nav() {
  const path = usePathname();
  const { state } = useStore();
  const [health, setHealth] = useState<{ engine: string; model: string | null } | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ engine: "rules", model: null }));
  }, []);

  const openTraces = state.traces.filter((t) => t.status !== "done").length;
  const pending = state.order.filter((id) => ["new", "drafted", "analyzing"].includes(state.items[id].status)).length;

  const tab = (href: string, label: string, count?: number) => (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-full text-sm transition ${
        path === href ? "bg-brand text-white" : "text-stone-700 hover:bg-stone-200"
      }`}
    >
      {label}
      {count ? <span className={`ml-1.5 text-xs ${path === href ? "text-white/80" : "text-stone-500"}`}>{count}</span> : null}
    </Link>
  );

  return (
    <header className="border-b border-stone-200 bg-white/80 backdrop-blur sticky top-0 z-20">
      <div className="mx-auto max-w-[1600px] px-4 h-14 flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="h-7 w-7 rounded-md bg-brand text-white grid place-items-center font-semibold text-sm">A</span>
          <span className="font-semibold tracking-tight">Aurel Copilot</span>
          <span className="text-xs text-stone-500 hidden sm:inline">Central Reservations</span>
        </Link>
        <nav className="flex items-center gap-1">
          {tab("/", "Desk", pending)}
          {tab("/ops", "Hotel traces", openTraces)}
          {tab("/about", "How it works")}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-xs">
          {health ? (
            health.engine === "claude" ? (
              <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                Live: {health.model}
              </span>
            ) : (
              <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200" title="Set ANTHROPIC_API_KEY to use the live model">
                Demo mode: rules engine
              </span>
            )
          ) : null}
        </div>
      </div>
    </header>
  );
}
