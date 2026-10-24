import { SEED_MESSAGES } from "../src/lib/inbox/seed";
import { analyzeWithRules } from "../src/lib/agent/rules";

const only = process.argv[2];
for (const m of SEED_MESSAGES) {
  if (only && m.id !== only) continue;
  const p = analyzeWithRules(m, new Date("2026-10-21T10:00:00Z"));
  console.log("=".repeat(80));
  console.log(m.id, m.channel, "|", p.triage.summary);
  console.log("category:", p.triage.category, "| hotel:", p.triage.hotelId, "| booking:", p.bookingMatch.bookingId, p.bookingMatch.confidence, "| urgency:", p.triage.urgency, "| conf:", p.confidence, "| autoSendEligible:", p.autoSendEligible, "| autoSend:", p.autoSend.kind);
  console.log("sensitive:", JSON.stringify(p.sensitiveData));
  for (const a of p.actions) console.log("  ACTION", JSON.stringify(a));
  console.log("  didNotPromise:", p.didNotPromise);
  console.log("  citations:", p.policyCitations.join(", "));
  console.log("--- draft ---\n" + p.draftReply);
}
