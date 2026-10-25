// The desk of 22, the owner-on-arrival rule and the Important-view rule
// (PRD Flow A, "Owner assigned on arrival" and "Important view").

import type { AgentProposal, Category } from "@/lib/agent/schema";

export type Role = "agent" | "senior" | "manager" | "groups";

export interface Staff {
  id: string;
  name: string;
  role: Role;
  // Rostered today. Whether they are on shift right now also depends on the window.
  onShift: boolean;
  // Today's shift window in desk time, 24h "HH:MM". Null = not rostered.
  shift: { start: string; end: string } | null;
}

export const DESK_HOURS = { open: "07:00", close: "23:00" };
export type ShiftOverrides = Record<string, "on" | "off">;

const EARLY = { start: "07:00", end: "15:30" };
const LATE = { start: "14:30", end: "23:00" };

export const ROLE_LABEL: Record<Role, string> = {
  agent: "Reservations agent",
  senior: "Senior agent",
  manager: "Reservations manager",
  groups: "Groups & events specialist",
};

// 2 managers, 3 groups specialists, 4 seniors, 13 agents = 22.
export const ROSTER: Staff[] = [
  { id: "mgr-1", name: "Inês Carvalho", role: "manager", onShift: true, shift: { start: "08:00", end: "17:00" } },
  { id: "mgr-2", name: "Luca Ferri", role: "manager", onShift: true, shift: { start: "14:00", end: "23:00" } },
  { id: "grp-1", name: "Sofia Marinou", role: "groups", onShift: true, shift: { start: "09:00", end: "18:00" } },
  { id: "grp-2", name: "Diego Alarcón", role: "groups", onShift: true, shift: { start: "10:00", end: "19:00" } },
  { id: "grp-3", name: "Rita Nunes", role: "groups", onShift: false, shift: null },
  { id: "snr-1", name: "Marta Oliveira", role: "senior", onShift: true, shift: EARLY },
  { id: "snr-2", name: "Nikos Petrou", role: "senior", onShift: true, shift: LATE },
  { id: "snr-3", name: "Giulia Conti", role: "senior", onShift: false, shift: null },
  { id: "snr-4", name: "Pablo Ruiz", role: "senior", onShift: false, shift: null },
  { id: "agt-1", name: "Ana Ribeiro", role: "agent", onShift: true, shift: EARLY },
  { id: "agt-2", name: "Carlos Mendes", role: "agent", onShift: true, shift: EARLY },
  { id: "agt-3", name: "Elena Papadaki", role: "agent", onShift: true, shift: EARLY },
  { id: "agt-4", name: "Francesca Russo", role: "agent", onShift: true, shift: EARLY },
  { id: "agt-5", name: "Hugo Santos", role: "agent", onShift: true, shift: LATE },
  { id: "agt-6", name: "Irene López", role: "agent", onShift: true, shift: LATE },
  { id: "agt-7", name: "João Pereira", role: "agent", onShift: true, shift: LATE },
  { id: "agt-8", name: "Katerina Vlachou", role: "agent", onShift: true, shift: LATE },
  { id: "agt-9", name: "Lorenzo Greco", role: "agent", onShift: false, shift: null },
  { id: "agt-10", name: "María García", role: "agent", onShift: false, shift: null },
  { id: "agt-11", name: "Nuno Costa", role: "agent", onShift: false, shift: null },
  { id: "agt-12", name: "Olga Dimitriou", role: "agent", onShift: false, shift: null },
  { id: "agt-13", name: "Paolo Bianchi", role: "agent", onShift: false, shift: null },
];

// The software, as the team sees it. The id stays "ai-agent" because browsers already store it.
export const AI_OWNER_ID = "ai-agent";
export const ASSISTANT_NAME = "Aurel Assistant";
// A reply read back from the mailbox when the desk was rebuilt; who approved it is not recorded there.
export const MAILBOX_OWNER_ID = "mailbox";
export const PENDING_LIMIT = 15;

export type Queue = "auto" | "agent" | "manager" | "sales" | "traces";

export const QUEUE_LABEL: Record<Queue, string> = {
  auto: "Auto-sent log",
  agent: "Agent queue",
  manager: "Manager queue",
  sales: "Sales queue",
  traces: "Hotel traces",
};

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function deskOpen(now: Date): boolean {
  const t = now.getHours() * 60 + now.getMinutes();
  return t >= minutes(DESK_HOURS.open) && t < minutes(DESK_HOURS.close);
}

// On shift right now: an explicit override wins (End my shift / Start my shift);
// otherwise rostered today and inside the window. When the desk is closed the
// window is ignored, so the prototype still has owners to assign to at night.
export function isOnShift(s: Staff, now: Date, overrides: ShiftOverrides = {}): boolean {
  const o = overrides[s.id];
  if (o) return o === "on";
  if (!s.onShift) return false;
  if (!s.shift || !deskOpen(now)) return true;
  const t = now.getHours() * 60 + now.getMinutes();
  return t >= minutes(s.shift.start) && t < minutes(s.shift.end);
}

export function onShiftStaff(role: Role, now: Date, overrides: ShiftOverrides = {}): Staff[] {
  return ROSTER.filter((s) => s.role === role && isOnShift(s, now, overrides));
}

// People whose window has just closed: rostered today, past their end, not overridden.
export function shiftEnded(now: Date, overrides: ShiftOverrides = {}): Staff[] {
  if (!deskOpen(now)) return [];
  const t = now.getHours() * 60 + now.getMinutes();
  return ROSTER.filter((s) => s.onShift && s.shift && !overrides[s.id] && t >= minutes(s.shift.end));
}

export function staffById(id: string): Staff | undefined {
  return ROSTER.find((s) => s.id === id);
}

export function ownerName(id: string | null): string {
  if (!id) return "Unassigned";
  if (id === AI_OWNER_ID) return ASSISTANT_NAME;
  if (id === MAILBOX_OWNER_ID) return "The desk, earlier";
  return staffById(id)?.name ?? id;
}

// Which queue an analysed item belongs to.
export function queueFor(p: AgentProposal): Queue {
  // Only a cited policy answer closes the item. Templates (holding reply,
  // group acknowledgement, off-topic decline) are sent at once, but the item
  // still goes to a person for the decision or for awareness.
  if (p.autoSend.kind === "policy_answer" || p.autoSend.kind === "ask_hotel") return "auto";
  if (p.triage.category === "group_event") return "sales";
  const handoff = p.actions.find((a) => a.type === "handoff");
  if (handoff && handoff.type === "handoff" && handoff.to === "reservations_manager") return "manager";
  return "agent";
}

export interface AssignInput {
  proposal: AgentProposal;
  pendingByOwner: Record<string, number>;
  rotation: number; // round-robin pointer over on-shift agents
  isVipOrAdvisor: boolean;
  now?: Date;
  overrides?: ShiftOverrides;
}

export interface AssignResult {
  ownerId: string;
  rotation: number;
  rule: string;
}

// Owner assigned on arrival, by rule (PRD page 2).
export function assignOwner(input: AssignInput): AssignResult {
  const { proposal: p, pendingByOwner, isVipOrAdvisor } = input;
  const rotation = input.rotation;
  const q = queueFor(p);
  const now = input.now ?? new Date();
  const onShift = (role: Role) => onShiftStaff(role, now, input.overrides);
  const leastLoaded = (list: Staff[]) =>
    [...list].sort((a, b) => (pendingByOwner[a.id] ?? 0) - (pendingByOwner[b.id] ?? 0))[0];

  if (q === "auto") return { ownerId: AI_OWNER_ID, rotation, rule: "Sends alone: Aurel Assistant owns it." };

  if (q === "manager") {
    const m = leastLoaded(onShift("manager")) ?? ROSTER.find((s) => s.role === "manager")!;
    return { ownerId: m.id, rotation, rule: "Outside the rules or a special rate: reservations manager on duty." };
  }

  if (q === "sales") {
    const g = leastLoaded(onShift("groups")) ?? ROSTER.find((s) => s.role === "groups")!;
    return { ownerId: g.id, rotation, rule: "Group or event: groups specialist on shift." };
  }

  if (isVipOrAdvisor || p.confidence < 0.6 || p.triage.category === "other") {
    const s = leastLoaded(onShift("senior")) ?? ROSTER.find((x) => x.role === "senior")!;
    return {
      ownerId: s.id,
      rotation,
      rule: isVipOrAdvisor ? "VIP or travel-advisor email: senior agent on shift." : "Could not be sorted with confidence: senior agent on shift.",
    };
  }

  // Next agent on shift in rotation, skipping anyone over the pending limit.
  const agents = onShift("agent");
  for (let i = 0; i < agents.length; i++) {
    const idx = (rotation + i) % agents.length;
    const a = agents[idx];
    if ((pendingByOwner[a.id] ?? 0) < PENDING_LIMIT) {
      return { ownerId: a.id, rotation: idx + 1, rule: `Next agent in rotation${i ? `, ${i} skipped over ${PENDING_LIMIT} pending` : ""}.` };
    }
  }
  // Everyone is over the limit: seniors absorb.
  const s = leastLoaded(onShift("senior")) ?? agents[0];
  return { ownerId: s.id, rotation, rule: "All agents over the pending limit: senior agent takes it." };
}

export interface ImportantInput {
  proposal: AgentProposal;
  body: string;
  arrivalIso: string | null;
  now: Date;
  isVipOrAdvisor: boolean;
  isRepeat: boolean;
}

// Important view: a view, not a type (PRD page 2).
export function importantReasons(input: ImportantInput): string[] {
  const { proposal: p, arrivalIso, now, isVipOrAdvisor, isRepeat, body } = input;
  const reasons: string[] = [];
  if (p.triage.category === "new_booking_enquiry") reasons.push("New booking or price enquiry");
  if (arrivalIso) {
    const hours = (Date.parse(arrivalIso) - now.getTime()) / 3600000;
    if (hours >= 0 && hours <= 48) reasons.push("Guest arrives within 48 hours");
  }
  if (p.sensitiveData.types.some((t) => t !== "payment_card")) reasons.push("Allergy, medical or accessibility content");
  if (isRepeat) reasons.push("Guest has written more than once about this");
  if (p.triage.category === "cancellation_refund" && /hospital|passed away|bereave|funeral|died|emergency/i.test(body)) reasons.push("Compassionate cancellation");
  if (isVipOrAdvisor) reasons.push("VIP or travel advisor");
  return reasons;
}

export const CATEGORY_ORDER: Category[] = [
  "new_booking_enquiry",
  "modify_booking",
  "special_request",
  "pre_arrival_question",
  "cancellation_refund",
  "group_event",
  "off_topic",
  "other",
];
