"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isPending, useStore } from "@/lib/store";
import { isOnShift, staffById } from "@/lib/desk/roster";

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  const { state, dispatch } = useStore();
  const [health, setHealth] = useState<{ engine: string; model: string | null; used?: number; capacity?: number; usage?: { model: string; used: number; limit: number }[] } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const gmail = state.gmail;
  const me = state.session ? staffById(state.session.staffId) : undefined;
  const onShift = me ? isOnShift(me, now, state.shiftOverrides) : false;

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

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

  const openTraces = state.traces.filter((t) => t.status !== "done").length;
  const pending = state.order.filter((id) => isPending(state.items[id])).length;

  const tab = (href: string, label: string, count?: number) => {
    const on = path === href;
    return (
      <Link href={href} className={`relative px-3 h-14 flex items-center text-sm transition ${on ? "text-stone-900 font-medium" : "text-stone-500 hover:text-stone-900"}`}>
        {label}
        {count ? <span className={`ml-1.5 text-xs tabular-nums ${on ? "text-stone-500" : "text-stone-400"}`}>{count}</span> : null}
        {on ? <span className="absolute left-2 right-2 bottom-0 h-0.5 bg-brand rounded-full" /> : null}
      </Link>
    );
  };

  return (
    <header className="border-b border-stone-200 bg-white sticky top-0 z-20">
      <div className="px-4 h-14 flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="h-7 w-7 rounded-md bg-brand text-white grid place-items-center font-semibold text-sm">A</span>
          <span className="font-semibold tracking-tight">Aurel Reservations</span>
        </Link>
        {state.session ? (
          <nav className="flex items-center">
            {tab("/", "Desk", pending)}
            {tab("/dashboard", "Dashboard")}
            {tab("/ops", "PMS traces", openTraces)}
            {tab("/about", "How it works")}
          </nav>
        ) : null}
        <div className="ml-auto flex items-center gap-4 text-sm">
          {gmail?.configured ? (
            <span className="flex items-center gap-1.5 text-xs text-stone-500" title={gmail.error ? `Gmail error: ${gmail.error}` : gmail.send ? "Live mailbox: new mail arrives here and approved replies are really sent" : "Live mailbox, read only"}>
              <span className={`h-2 w-2 rounded-full ${gmail.error ? "bg-rose-500" : "bg-emerald-500"}`} />
              {gmail.address ? `Live mail: ${gmail.address}${gmail.send ? "" : " (read only)"}` : "Gmail not reachable"}
            </span>
          ) : null}
          {health ? (
            <span
              className="flex items-center gap-1.5 text-xs text-stone-500"
              title={
                health.engine === "gemini"
                  ? `Model requests since the server started, per model (free tier allows ${health.usage?.[0]?.limit ?? 20} a day each): ${(health.usage ?? []).map((u) => `${u.model} ${u.used}/${u.limit}`).join(" · ")}`
                  : "No GEMINI_API_KEY set; the rules engine sorts messages"
              }
            >
              <span className={`h-2 w-2 rounded-full ${health.engine === "gemini" ? ((health.used ?? 0) / (health.capacity || 1) > 0.8 ? "bg-rose-500" : "bg-emerald-500") : "bg-amber-400"}`} />
              {health.engine === "gemini" ? `Gemini live${typeof health.used === "number" && health.capacity ? ` · ${health.used}/${health.capacity} requests` : ""}` : "Rules engine"}
            </span>
          ) : null}
          {state.session ? (
            <span className="flex items-center gap-3 text-stone-600">
              <span>
                {state.session.name} <span className="text-stone-400">· {state.session.role}</span>
              </span>
              {me ? (
                <span className="flex items-center gap-1.5 text-xs text-stone-500">
                  <span className={`h-2 w-2 rounded-full ${onShift ? "bg-emerald-500" : "bg-stone-300"}`} />
                  {onShift ? `On shift${me.shift ? ` until ${me.shift.end}` : ""}` : "Off shift"}
                  <button
                    onClick={() => dispatch({ type: "shift_override", staffId: me.id, on: !onShift })}
                    className="underline hover:text-stone-900"
                    title={onShift ? "Your pending items move to colleagues on shift by the owner rule, and the dashboard logs it." : "Take items again."}
                  >
                    {onShift ? "End my shift" : "Start my shift"}
                  </button>
                </span>
              ) : null}
              <button
                onClick={() => {
                  dispatch({ type: "logout" });
                  router.replace("/login");
                }}
                className="text-stone-500 hover:text-stone-900"
              >
                Sign out
              </button>
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}
