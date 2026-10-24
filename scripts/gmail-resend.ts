// Re-sends the AI agent's reply to a guest email the desk has already taken, through
// the same code path the desk uses. For checking the mail format after a fix.
//   npx tsx --env-file=.env.local scripts/gmail-resend.ts <guest address>
import { pullNewMessages, sendReply, toInbound } from "../src/lib/gmail";
import { analyzeWithRules } from "../src/lib/agent/rules";

void pullNewMessages; // keeps the module's exports in scope for type checking

async function main() {
  const who = process.argv[2];
  if (!who) throw new Error("pass the guest address");
  const key = process.env.GEMINI_API_KEY; // unused here; the rules engine drafts the reply
  void key;
  // Fetch the newest taken message from that sender through the raw API.
  const token = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GMAIL_CLIENT_ID!, client_secret: process.env.GMAIL_CLIENT_SECRET!, refresh_token: process.env.GMAIL_REFRESH_TOKEN!, grant_type: "refresh_token" }),
  }).then((r) => r.json() as Promise<{ access_token: string }>);
  const h = { authorization: `Bearer ${token.access_token}` };
  const q = encodeURIComponent(`from:${who} label:Aurel/Desk`);
  const list = (await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=1`, { headers: h }).then((r) => r.json())) as { messages?: { id: string }[] };
  if (!list.messages?.length) throw new Error(`no taken message from ${who}`);
  const full = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${list.messages[0].id}?format=full`, { headers: h }).then((r) => r.json());
  const msg = toInbound(full);
  console.log("message:", msg.subject, "|", msg.body.slice(0, 80));
  const p = analyzeWithRules(msg, new Date());
  console.log("category:", p.triage.category, "| autoSend:", p.autoSend.kind);
  const sent = await sendReply({ message: msg, body: p.draftReply });
  console.log("sent:", sent.id, "to", sent.to, "in thread", sent.threadId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
