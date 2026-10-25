"use client";

// The person, at the far right of the header: initials with a shift dot, opening a menu
// with the shift, My profile and Sign out.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ownerLabel, useStore } from "@/lib/store";
import { ROLE_LABEL, isOnShift, staffById } from "@/lib/desk/roster";
import { ProfilePanel, initialsOf } from "@/components/ProfilePanel";

export function ProfileMenu() {
  const { state, dispatch } = useStore();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
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

  const session = state.session;
  if (!session) return null;
  const me = staffById(session.staffId);
  const onShift = me ? isOnShift(me, now, state.shiftOverrides) : false;
  const name = ownerLabel(state, session.staffId);

  const signOut = () => {
    void fetch("/api/logout", { method: "POST" }).catch(() => undefined);
    dispatch({ type: "logout" });
    router.replace("/login");
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`${name}, ${ROLE_LABEL[session.role]}. Account menu`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${name} · ${ROLE_LABEL[session.role]}${onShift ? " · on shift" : " · off shift"}`}
        className="relative h-8 w-8 rounded-full bg-brand text-white text-xs font-semibold grid place-items-center hover:ring-2 hover:ring-brand/30"
      >
        {initialsOf(name)}
        <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${onShift ? "bg-emerald-500" : "bg-stone-300"}`} aria-hidden="true" />
      </button>

      {open ? (
        <div role="menu" aria-label="Account" className="absolute right-0 top-10 w-64 rounded-xl border border-stone-200 bg-white shadow-lg z-30 text-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-100">
            <div className="font-semibold truncate">{name}</div>
            <div className="text-xs text-stone-500">{ROLE_LABEL[session.role]}</div>
          </div>
          <div className="px-4 py-2.5 border-b border-stone-100 flex items-center gap-2 text-xs text-stone-600">
            <span className={`h-2 w-2 rounded-full ${onShift ? "bg-emerald-500" : "bg-stone-300"}`} />
            {onShift ? `On shift${me?.shift ? ` until ${me.shift.end}` : ""}` : "Off shift"}
            {me ? (
              <button
                role="menuitem"
                onClick={() => {
                  dispatch({ type: "shift_override", staffId: me.id, on: !onShift });
                  setOpen(false);
                }}
                className="ml-auto underline underline-offset-2 hover:text-stone-900"
                title={onShift ? "Your open conversations move to colleagues on shift by the owner rule, and the dashboard logs it." : "Take conversations again."}
              >
                {onShift ? "End my shift" : "Start my shift"}
              </button>
            ) : null}
          </div>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setProfileOpen(true);
            }}
            className="w-full text-left px-4 py-2.5 hover:bg-stone-50"
          >
            My profile
          </button>
          <button role="menuitem" onClick={signOut} className="w-full text-left px-4 py-2.5 hover:bg-stone-50 text-stone-600 border-t border-stone-100">
            Sign out
          </button>
        </div>
      ) : null}

      {profileOpen ? <ProfilePanel onClose={() => setProfileOpen(false)} /> : null}
    </div>
  );
}
