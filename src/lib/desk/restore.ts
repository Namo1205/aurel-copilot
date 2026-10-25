// "Reload from the mailbox": rebuild a fresh or cleared browser from what the desk
// has taken from Gmail. Answered messages come back closed with the reply shown;
// unanswered ones come back open and are sorted and owned again like new mail.
import type { Action } from "@/lib/store";
import type { InboundMessage } from "@/lib/inbox/seed";

export interface RestoreResult {
  closed: number;
  reopened: number;
  days: number;
}

export async function restoreFromMailbox(dispatch: (a: Action) => void, days = 3): Promise<RestoreResult> {
  const r = await fetch(`/api/gmail/history?days=${days}`);
  const j = (await r.json().catch(() => ({}))) as { messages?: { message: InboundMessage; receivedAt: string; reply: { body: string; at: string } | null }[]; error?: string; days?: number };
  if (!r.ok) throw new Error(j.error ?? `Could not read the mailbox (${r.status}).`);
  let closed = 0;
  let reopened = 0;
  for (const { message, receivedAt, reply } of j.messages ?? []) {
    if (reply) {
      dispatch({ type: "restore_message", message, receivedAt, reply });
      closed++;
    } else {
      const ageMin = Math.max(0, Math.round((Date.now() - Date.parse(receivedAt)) / 60000));
      dispatch({ type: "add_message", message: { ...message, receivedMinutesAgo: ageMin } });
      reopened++;
    }
  }
  return { closed, reopened, days: j.days ?? days };
}
