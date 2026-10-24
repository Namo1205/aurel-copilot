"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { ROLE_LABEL, ROSTER, isOnShift, type Role } from "@/lib/desk/roster";
import { Button } from "@/components/ui";

const PASSWORD = "aurel";

const ROLE_HINT: Record<Role, string> = {
  agent: "Works the Important view and their own queue. Approves, edits, changes the type.",
  senior: "Everything an agent has, plus the team's lists and reassignment.",
  manager: "Owns the Manager queue and sees the whole dashboard.",
  groups: "Owns the Sales queue: group and event requests.",
};

export default function Login() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { state, dispatch } = useStore();
  const router = useRouter();
  const params = useSearchParams();
  // Prototype deep link: /login?as=agt-1 signs in as that person without the form.
  useEffect(() => {
    const as = params.get("as");
    if (!as || !state.hydrated) return;
    const s = ROSTER.find((x) => x.id === as);
    if (!s) return;
    dispatch({ type: "login", session: { staffId: s.id, role: s.role, name: s.name } });
    const next = params.get("next");
    router.replace(next && next.startsWith("/") ? next : s.role === "manager" ? "/dashboard" : "/");
  }, [params, state.hydrated, dispatch, router]);
  const [now] = useState(() => new Date());
  const onNow = (s: (typeof ROSTER)[number]) => isOnShift(s, now, state.shiftOverrides);
  const [role, setRole] = useState<Role>("agent");
  const [staffId, setStaffId] = useState<string>(() => (ROSTER.find((s) => s.role === "agent" && isOnShift(s, new Date())) ?? ROSTER.find((s) => s.role === "agent"))!.id);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const staffForRole = ROSTER.filter((s) => s.role === role);

  const submit = () => {
    if (pw !== PASSWORD) {
      setErr("Incorrect password. Please try again.");
      return;
    }
    const s = ROSTER.find((x) => x.id === staffId)!;
    dispatch({ type: "login", session: { staffId: s.id, role: s.role, name: s.name } });
    router.replace(s.role === "manager" ? "/dashboard" : "/");
  };

  return (
    <div className="flex-1 grid place-items-center p-6">
      <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 space-y-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-8 w-8 rounded-md bg-brand text-white grid place-items-center font-semibold">A</span>
            <div>
              <div className="font-semibold">Aurel Reservations AI Agent</div>
              <div className="text-xs text-stone-500">Sign in to the desk</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
            <button
              key={r}
              onClick={() => {
                setRole(r);
                setStaffId((ROSTER.find((s) => s.role === r && onNow(s)) ?? ROSTER.find((s) => s.role === r))!.id);
              }}
              className={`text-left rounded-lg border p-3 text-sm transition ${role === r ? "border-brand bg-brand-soft" : "border-stone-200 hover:bg-stone-50"}`}
            >
              <div className="font-medium">{ROLE_LABEL[r]}</div>
              <div className="text-[11px] text-stone-500 mt-1">{ROLE_HINT[r]}</div>
            </button>
          ))}
        </div>

        <label className="block text-sm">
          <span className="text-xs text-stone-500">Who are you?</span>
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 bg-white">
            {staffForRole.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {onNow(s) ? (s.shift ? ` (on shift until ${s.shift.end})` : "") : " (off shift)"}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-xs text-stone-500">Password</span>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5"
          />
        </label>
        {err ? <div className="text-xs text-rose-700">{err}</div> : null}
        <Button onClick={submit}>Sign in</Button>
        <p className="text-[11px] text-stone-500">
          Roles change what you see; the desk is the same for everyone.
          {state.session ? ` Currently signed in as ${state.session.name}.` : ""}
        </p>
        <p className="text-[11px] text-stone-500">
          {state.gmail?.configured ? `Live mailbox: ${state.gmail.address ?? "connected"}. ` : "No mailbox connected: the desk shows the sample messages from the brief. "}
          <button onClick={() => dispatch({ type: "load_samples" })} className="underline hover:text-stone-700">
            Load the sample messages
          </button>
          {" · "}
          <button onClick={() => dispatch({ type: "reset" })} className="underline hover:text-stone-700">
            Clear the desk
          </button>
        </p>
      </div>
    </div>
  );
}
