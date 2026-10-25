import { useSyncExternalStore, type ReactNode } from "react";
import type { Channel } from "@/lib/agent/schema";

// True when the viewport matches, kept in sync with the window. Wide on the server.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => true,
  );
}

export function Badge({ children, tone = "stone", title }: { children: ReactNode; tone?: "stone" | "green" | "amber" | "rose" | "blue" | "brand"; title?: string }) {
  const tones = {
    stone: "bg-stone-100 text-stone-700 border-stone-200",
    green: "bg-emerald-50 text-emerald-800 border-emerald-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    rose: "bg-rose-50 text-rose-800 border-rose-200",
    blue: "bg-sky-50 text-sky-800 border-sky-200",
    brand: "bg-brand-soft text-brand border-emerald-900/10",
  } as const;
  return (
    <span title={title} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  type = "button",
  size = "md",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  size?: "sm" | "md";
  title?: string;
}) {
  const v = {
    primary: "bg-brand text-white hover:bg-emerald-950 disabled:bg-stone-300",
    secondary: "bg-white border border-stone-300 text-stone-800 hover:bg-stone-50 disabled:text-stone-400",
    ghost: "text-stone-700 hover:bg-stone-100 disabled:text-stone-400",
    danger: "bg-rose-700 text-white hover:bg-rose-800 disabled:bg-stone-300",
  }[variant];
  const s = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm";
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={`rounded-md font-medium transition ${v} ${s}`}>
      {children}
    </button>
  );
}

export function ChannelIcon({ channel }: { channel: Channel }) {
  const map: Record<Channel, { label: string; cls: string }> = {
    email: { label: "@", cls: "bg-sky-100 text-sky-800" },
    whatsapp: { label: "W", cls: "bg-emerald-100 text-emerald-800" },
    ota: { label: "B", cls: "bg-indigo-100 text-indigo-800" },
    phone: { label: "☎", cls: "bg-stone-200 text-stone-700" },
  };
  const m = map[channel];
  return (
    <span title={channel} className={`h-7 w-7 shrink-0 rounded-full grid place-items-center text-xs font-semibold ${m.cls}`}>
      {m.label}
    </span>
  );
}

export const CHANNEL_LABEL: Record<Channel, string> = { email: "Email", whatsapp: "WhatsApp", ota: "OTA message", phone: "Phone note" };

export function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ${mins % 60}m`;
  return `${Math.floor(h / 24)}d`;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white">
      <header className="px-4 py-2.5 border-b border-stone-100 flex items-center">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</h3>
        <div className="ml-auto">{right}</div>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
