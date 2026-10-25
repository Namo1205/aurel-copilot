"use client";

// The navigation rail left of the conversation list. Work (what needs people), Record
// (what was sent alone, what is done) and, for seniors and managers, Team. Collapses to
// icons; the choice is remembered per person.

import type { Staff } from "@/lib/desk/roster";
import type { View, ViewId } from "@/lib/desk/visibility";
import { ownerLabel, useStore } from "@/lib/store";

export interface TeamRow {
  s: Staff;
  open: number;
}

const ICONS: Record<View["icon"], React.ReactNode> = {
  inbox: <path d="M3 13h5l2 3h4l2-3h5M5 5h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />,
  flag: <path d="M5 21V4m0 0h12l-2 4 2 4H5" />,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3zM9 12l2 2 4-4" />,
  all: <path d="M4 6h16M4 12h16M4 18h10" />,
  sent: <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />,
  done: <path d="M20 6L9 17l-5-5" />,
};

function Icon({ name }: { name: View["icon"] }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      {ICONS[name]}
    </svg>
  );
}

function Row({ active, collapsed, label, count, hot, icon, onClick, title }: { active: boolean; collapsed: boolean; label: string; count?: number; hot?: boolean; icon?: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? `${label}${count ? ` · ${count}` : ""}` : title}
      aria-current={active ? "page" : undefined}
      className={`w-full flex items-center gap-2.5 rounded-md text-[13px] transition ${collapsed ? "justify-center h-9 w-9 mx-auto" : "px-2.5 py-1.5"} ${active ? "bg-white font-medium text-stone-900 shadow-sm" : "text-stone-600 hover:bg-white/70 hover:text-stone-900"}`}
    >
      <span className="relative shrink-0 grid place-items-center">
        {icon ?? <span className="h-4 w-4 rounded-full bg-stone-200 text-[9px] font-semibold text-stone-600 grid place-items-center">{label.slice(0, 1)}</span>}
        {collapsed && count ? <span className={`absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-semibold grid place-items-center tabular-nums ${hot ? "bg-rose-600 text-white" : "bg-stone-300 text-stone-800"}`}>{count > 99 ? "99+" : count}</span> : null}
      </span>
      {!collapsed ? (
        <>
          <span className="truncate">{label}</span>
          {count ? <span className={`ml-auto text-xs tabular-nums ${hot ? "text-rose-700 font-medium" : active ? "text-stone-500" : "text-stone-400"}`}>{count}</span> : null}
        </>
      ) : null}
    </button>
  );
}

function SectionTitle({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  return collapsed ? <div className="my-1.5 mx-3 h-px bg-stone-200" aria-hidden="true" /> : <div className="px-2.5 pt-3 pb-1 text-[11px] uppercase tracking-wide text-stone-400">{children}</div>;
}

export function NavRail({
  views,
  counts,
  activeId,
  onView,
  team,
  me,
  myOpen,
  focus,
  onFocus,
  collapsed,
  onToggle,
}: {
  views: View[];
  counts: Record<string, number>;
  activeId: ViewId;
  onView: (v: View) => void;
  // Seniors and managers: agents with open items, for focusing the list on one person.
  team?: TeamRow[];
  me: string;
  myOpen: number;
  focus: string;
  onFocus: (staffId: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { state } = useStore();
  const work = views.filter((v) => v.section === "work");
  const record = views.filter((v) => v.section === "record");
  return (
    <nav aria-label="Desk views" className={`shrink-0 border-r border-stone-200 bg-stone-50 flex flex-col min-h-0 transition-[width] duration-150 ${collapsed ? "w-14" : "w-56"}`}>
      <div className={`flex-1 overflow-y-auto scroll-thin ${collapsed ? "px-0 py-2 space-y-1" : "px-2 pb-2"}`}>
        <SectionTitle collapsed={collapsed}>Work</SectionTitle>
        {work.map((v) => (
          <Row key={v.id} active={v.id === activeId} collapsed={collapsed} label={v.label} count={counts[v.id]} hot={v.id === "important" && !!counts[v.id]} icon={<Icon name={v.icon} />} onClick={() => onView(v)} />
        ))}
        <SectionTitle collapsed={collapsed}>Record</SectionTitle>
        {record.map((v) => (
          <Row key={v.id} active={v.id === activeId} collapsed={collapsed} label={v.label} count={counts[v.id]} icon={<Icon name={v.icon} />} onClick={() => onView(v)} />
        ))}
        {team ? (
          <>
            <SectionTitle collapsed={collapsed}>Team</SectionTitle>
            <Row active={focus === ""} collapsed={collapsed} label="Everyone" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>} onClick={() => onFocus("")} title="Everyone's conversations" />
            <Row active={focus === me} collapsed={collapsed} label="Me" count={myOpen} onClick={() => onFocus(me)} title="Only my conversations" />
            {team.map(({ s, open }) => (
              <Row key={s.id} active={focus === s.id} collapsed={collapsed} label={ownerLabel(state, s.id).split(" ")[0]} count={open} hot={open >= 5} onClick={() => onFocus(s.id)} title={`${ownerLabel(state, s.id)} · ${open} open`} />
            ))}
          </>
        ) : null}
      </div>
      <button
        onClick={onToggle}
        className="h-10 shrink-0 border-t border-stone-200 grid place-items-center text-stone-400 hover:text-stone-900 hover:bg-white/70"
        title={collapsed ? "Expand the navigation" : "Collapse the navigation"}
        aria-label={collapsed ? "Expand the navigation" : "Collapse the navigation"}
        aria-expanded={!collapsed}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={collapsed ? "rotate-180" : ""}>
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
    </nav>
  );
}
