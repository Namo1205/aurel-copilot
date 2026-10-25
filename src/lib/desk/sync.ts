// Loads the whole mailbox into a desk, automatically. Answered messages come back closed
// with the reply the desk sent; unanswered ones come back open and are sorted and owned
// like new mail. Anything older than a day is marked imported: a person decides, nothing
// is sent alone. The reducers ignore messages the desk already has.
import type { Action } from "@/lib/store";
import type { InboundMessage } from "@/lib/inbox/seed";

export interface SyncItem {
  message: InboundMessage;
  receivedAt: string;
  reply: { body: string; at: string } | null;
  taken: boolean;
}

const STALE_MS = 24 * 3600000;

export function importItems(dispatch: (a: Action) => void, items: SyncItem[]): { closed: number; reopened: number } {
  let closed = 0;
  let reopened = 0;
  for (const { message, receivedAt, reply } of items) {
    if (reply) {
      dispatch({ type: "restore_message", message, receivedAt, reply });
      closed++;
    } else {
      const age = Date.now() - Date.parse(receivedAt);
      dispatch({ type: "add_message", message: { ...message, receivedMinutesAgo: Math.max(0, Math.round(age / 60000)), imported: age > STALE_MS || undefined } });
      reopened++;
    }
  }
  return { closed, reopened };
}

export async function syncMailbox(dispatch: (a: Action) => void, onProgress: (loaded: number, estimate: number) => void): Promise<{ closed: number; reopened: number }> {
  let pageToken: string | null = null;
  let loaded = 0;
  let closed = 0;
  let reopened = 0;
  do {
    const r: Response = await fetch("/api/gmail/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pageToken }) });
    const j = (await r.json().catch(() => ({}))) as { items?: SyncItem[]; nextPageToken?: string | null; estimate?: number; error?: string };
    if (r.status === 401) throw new Error("401: signed out");
    if (!r.ok) throw new Error(j.error ?? `Mailbox load failed (${r.status})`);
    const n = importItems(dispatch, j.items ?? []);
    closed += n.closed;
    reopened += n.reopened;
    loaded += (j.items ?? []).length;
    onProgress(loaded, j.estimate ?? 0);
    pageToken = j.nextPageToken ?? null;
  } while (pageToken);
  return { closed, reopened };
}
