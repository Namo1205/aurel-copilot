import { NextResponse } from "next/server";
import { LABELS, addLabels, attachThreadContext, gmailConfigured, gmailSendEnabled, listNewMessages, sendReply } from "@/lib/gmail";
import { analyze } from "@/lib/agent";
import { checkCronSecret, cronConfigured } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// One run stops taking new messages after this long; what is left stays unlabelled
// for the next run, five minutes later. cron-job.org closes its connection at 30 s
// and counts the run as failed, so a run must answer well inside that; a single
// Gemini sort can take 40 s, and maxDuration keeps one slow sort from being cut off.
const BUDGET_MS = 20_000;

// The scheduled mailbox check. Called every few minutes with
// "Authorization: Bearer CRON_SECRET" by whichever scheduler is set up: an external
// pinger (cron-job.org), Vercel's own daily cron (vercel.json, which sends the same
// header on its own) and the best-effort GitHub Actions workflow in
// .github/workflows/poll-mailbox.yml. Any number of them may run; the labels keep
// a message from being answered twice.
//
// It reads new mail and sends only what the AI agent may send alone: a cited policy
// answer or one of the fixed templates. Those messages are labelled Aurel/Auto-replied
// and left unread, so the next desk tab still receives them and shows the reply.
// Anything that needs a person is labelled Aurel/Waiting and left untouched for the
// desk. Nothing is stored on the server; the labels in Gmail are the whole state.
export async function GET(req: Request) {
  if (!cronConfigured()) return NextResponse.json({ error: "CRON_SECRET is not set; the scheduled check is off." }, { status: 503 });
  if (!checkCronSecret(req.headers.get("authorization"))) return NextResponse.json({ error: "Bad or missing bearer token." }, { status: 401 });
  if (!gmailConfigured()) return NextResponse.json({ skipped: "No mailbox connected." });
  if (!gmailSendEnabled()) return NextResponse.json({ skipped: "GMAIL_SEND=off: the scheduled check only runs when it may send." });

  const started = Date.now();
  const replied: { id: string; from: string; kind: string; category: string; engine: string; tookMs: number }[] = [];
  const waiting: { id: string; from: string; category: string; engine: string; tookMs: number }[] = [];
  const errors: { id: string; error: string }[] = [];
  let remaining = 0;
  try {
    const messages = await listNewMessages({ max: 10, excludeLabels: [LABELS.autoReplied, LABELS.waiting] });
    for (const [i, msg] of messages.entries()) {
      if (Date.now() - started > BUDGET_MS) {
        remaining = messages.length - i;
        break;
      }
      const id = msg.gmail!.id;
      const t0 = Date.now();
      try {
        await attachThreadContext(msg);
        const a = await analyze(msg);
        const auto = a.proposal.autoSend;
        const body = auto.kind !== "none" ? auto.body || a.proposal.draftReply : "";
        if (auto.kind !== "none" && body) {
          await sendReply({ message: msg, body });
          await addLabels(id, [LABELS.autoReplied]);
          replied.push({ id, from: msg.from, kind: auto.kind, category: a.proposal.triage.category, engine: a.engine, tookMs: Date.now() - t0 });
        } else {
          await addLabels(id, [LABELS.waiting]);
          waiting.push({ id, from: msg.from, category: a.proposal.triage.category, engine: a.engine, tookMs: Date.now() - t0 });
        }
      } catch (e) {
        // Left untouched: the next run tries again.
        errors.push({ id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return NextResponse.json({ checked: messages.length - remaining, remaining, replied, waiting, errors, ms: Date.now() - started });
  } catch (e) {
    return NextResponse.json({ replied, waiting, errors, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
