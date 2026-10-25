"use client";

// My profile: what colleagues see and how they reach you, the first-name sign-off on
// replies you approve, and the desktop alert for failed sends. Kept per person in this
// browser, like the rest of the desk state.

import { useEffect, useState } from "react";
import { useStore, type Profile } from "@/lib/store";
import { ROLE_LABEL, staffById } from "@/lib/desk/roster";

function Field({ label, value, placeholder, type = "text", onChange }: { label: string; value: string; placeholder?: string; type?: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="text-xs text-stone-500">{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30" />
    </label>
  );
}

function Toggle({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-3 text-sm ${disabled ? "opacity-60" : ""}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-1 accent-emerald-900" />
      <span>
        <span className="font-medium">{label}</span>
        {hint ? <span className="block text-xs text-stone-500 mt-0.5">{hint}</span> : null}
      </span>
    </label>
  );
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function ProfilePanel({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const session = state.session;
  const staff = session ? staffById(session.staffId) : undefined;
  const profile: Profile = (session && state.profiles[session.staffId]) || {};
  const [saved, setSaved] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!session || !staff) return null;
  const name = profile.displayName?.trim() || staff.name;
  const first = name.split(/\s+/)[0];
  const set = (p: Partial<Profile>) => {
    dispatch({ type: "set_profile", staffId: session.staffId, profile: p });
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  };
  const enableAlerts = async (on: boolean) => {
    if (on && permission === "default") {
      const p = await Notification.requestPermission();
      setPermission(p);
      set({ desktopAlerts: p === "granted" });
      return;
    }
    set({ desktopAlerts: on });
  };

  return (
    <>
      <div className="fixed inset-0 z-30 bg-stone-900/10" onClick={onClose} aria-hidden="true" />
      <aside role="dialog" aria-label="My profile" className="fixed inset-y-0 right-0 w-[380px] max-w-[90vw] z-40 bg-white border-l border-stone-200 shadow-2xl flex flex-col">
        <div className="px-5 h-14 flex items-center border-b border-stone-100 shrink-0">
          <span className="font-semibold">My profile</span>
          <span className={`ml-3 text-xs text-emerald-800 transition-opacity ${saved ? "opacity-100" : "opacity-0"}`} aria-live="polite">
            Saved
          </span>
          <button onClick={onClose} aria-label="Close profile" className="ml-auto h-8 w-8 grid place-items-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-900 text-lg leading-none">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scroll-thin px-5 py-5 space-y-6">
          <div className="flex items-center gap-4">
            <span className="h-14 w-14 rounded-full bg-brand text-white grid place-items-center text-lg font-semibold">{initialsOf(name)}</span>
            <div>
              <div className="font-semibold">{name}</div>
              <div className="text-xs text-stone-500">{ROLE_LABEL[staff.role]}</div>
            </div>
          </div>

          <div className="space-y-3">
            <Field label="Display name" value={profile.displayName ?? ""} placeholder={staff.name} onChange={(v) => set({ displayName: v })} />
            <Field label="Work email" value={profile.email ?? ""} placeholder="name@aurelhotels.example" type="email" onChange={(v) => set({ email: v })} />
            <Field label="Phone" value={profile.phone ?? ""} placeholder="+351 …" type="tel" onChange={(v) => set({ phone: v })} />
            <p className="text-[11px] text-stone-500">Colleagues see your display name as the owner of your conversations, and reach you on these.</p>
          </div>

          <div className="space-y-3">
            <Toggle
              label="Sign replies with my first name"
              hint={`Replies you approve end "Warm regards, ${first} · Aurel Reservations". Answers Aurel Assistant sends alone stay signed as the team.`}
              checked={!!profile.signOff}
              onChange={(v) => set({ signOff: v })}
            />
            <Toggle
              label="Desktop alert when a reply fails to send"
              hint={permission === "unsupported" ? "This browser does not support desktop alerts." : permission === "denied" ? "Blocked in the browser. Allow notifications for this site to turn it on." : "Only for a reply the guest did not receive, and only while this tab is in the background."}
              checked={!!profile.desktopAlerts && permission === "granted"}
              disabled={permission === "unsupported" || permission === "denied"}
              onChange={(v) => void enableAlerts(v)}
            />
          </div>

          <div className="rounded-lg bg-stone-50 border border-stone-100 p-3 text-xs text-stone-600 space-y-1">
            <div>
              <span className="text-stone-400">Role</span> · {ROLE_LABEL[staff.role]}
            </div>
            <div>
              <span className="text-stone-400">Shift today</span> · {staff.shift ? `${staff.shift.start} to ${staff.shift.end}` : "not rostered"}
            </div>
            <div>
              <span className="text-stone-400">Staff id</span> · {staff.id}
            </div>
          </div>
        </div>
        <p className="px-5 py-3 border-t border-stone-100 text-[11px] text-stone-400 shrink-0">Kept in this browser. A shared directory comes with the shared desk store.</p>
      </aside>
    </>
  );
}
