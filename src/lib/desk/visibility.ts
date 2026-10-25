// Who sees what, and how messages group into conversations.
//
// Visibility follows responsibility: an agent sees the conversations they own or
// handled, a senior sees their own plus every agent's, a manager sees everything,
// a groups specialist sees the Sales conversations. Allergy and medical detail
// therefore reaches the fewest people who need it (PRD, sensitive data).

import { AI_OWNER_ID, staffById, type Role } from "./roster";
import { isPending, type InboxItem, type Session } from "@/lib/store";

export function canSeeItem(session: Session, item: InboxItem): boolean {
  if (session.role === "manager") return true;
  const mine = item.ownerId === session.staffId || item.handledBy === session.staffId;
  if (mine) return true;
  if (session.role === "senior") {
    if (item.ownerId === AI_OWNER_ID) return true;
    const owner = item.ownerId ? staffById(item.ownerId) : undefined;
    return owner?.role === "agent" || owner?.role === "senior" || !item.ownerId;
  }
  if (session.role === "groups") return item.queue === "sales";
  return false;
}

// One conversation per Gmail thread; simulated messages group by sender address.
export function conversationKey(item: InboxItem): string {
  return item.message.gmail?.threadId ? `thread:${item.message.gmail.threadId}` : `from:${item.message.from.toLowerCase()}`;
}

export interface Conversation {
  key: string;
  items: InboxItem[]; // oldest first
  latest: InboxItem;
  // The message that still needs a person, if any: what the composer acts on.
  open: InboxItem | null;
  lastActivity: string;
}

export function buildConversations(items: InboxItem[]): Conversation[] {
  const map = new Map<string, InboxItem[]>();
  for (const it of items) {
    const k = conversationKey(it);
    map.set(k, [...(map.get(k) ?? []), it]);
  }
  const out: Conversation[] = [];
  for (const [key, list] of map) {
    list.sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt));
    const latest = list[list.length - 1];
    const open = [...list].reverse().find(isPending) ?? null;
    const lastActivity = list.reduce((m, it) => {
      const t = [it.receivedAt, it.handledAt, it.autoSentAt, it.result?.sentReply?.sentAt].filter(Boolean) as string[];
      return t.reduce((mm, x) => (Date.parse(x) > Date.parse(mm) ? x : mm), m);
    }, list[0].receivedAt);
    out.push({ key, items: list, latest, open, lastActivity });
  }
  // Open conversations first, oldest waiting at the top; then closed, newest first.
  return out.sort((a, b) => {
    if (!!a.open !== !!b.open) return a.open ? -1 : 1;
    if (a.open && b.open) return Date.parse(a.open.receivedAt) - Date.parse(b.open.receivedAt);
    return Date.parse(b.lastActivity) - Date.parse(a.lastActivity);
  });
}

export type ViewId = "open" | "done" | "important" | "manager" | "sales" | "auto" | "all";

export interface View {
  id: ViewId;
  label: string;
  filter: (c: Conversation) => boolean;
}

// The views each role gets. The first is where they land.
export function viewsFor(role: Role): View[] {
  const open: View = { id: "open", label: "Open", filter: (c) => !!c.open };
  const done: View = { id: "done", label: "Done", filter: (c) => !c.open };
  const important: View = { id: "important", label: "Important", filter: (c) => !!c.open && c.open.important.length > 0 };
  const auto: View = { id: "auto", label: "Sent alone", filter: (c) => c.items.some((i) => !!i.autoSentAt) };
  switch (role) {
    case "agent":
      return [open, done];
    case "groups":
      return [open, done];
    case "senior":
      return [open, important, auto, done];
    case "manager":
      return [
        { id: "manager", label: "Manager", filter: (c) => !!c.open && c.open.queue === "manager" },
        important,
        { id: "all", label: "All open", filter: (c) => !!c.open },
        auto,
        done,
      ];
  }
}

// Seniors can focus the list on one agent; "" means everything they can see.
export function conversationsFor(session: Session, items: InboxItem[], focusStaffId = ""): Conversation[] {
  const visible = items.filter((i) => canSeeItem(session, i));
  let convs = buildConversations(visible);
  if (focusStaffId) convs = convs.filter((c) => c.items.some((i) => i.ownerId === focusStaffId || i.handledBy === focusStaffId));
  return convs;
}
