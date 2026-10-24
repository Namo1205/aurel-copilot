// Runs every seed message through the Gemini engine and the rules engine and
// prints where they disagree. Needs GEMINI_API_KEY in .env.local.
//   npx tsx --env-file=.env.local scripts/run-gemini.ts          # all seeds
//   npx tsx --env-file=.env.local scripts/run-gemini.ts m-012 m-013   # some messages
//   GEMINI_MODEL=gemini-3-flash-preview npx tsx --env-file=.env.local scripts/run-gemini.ts   # another model
import { SEED_MESSAGES } from "../src/lib/inbox/seed";
import { analyzeWithRules } from "../src/lib/agent/rules";
import { analyzeWithGemini, MODEL } from "../src/lib/agent/gemini";

if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY is not set. Run with: npx tsx --env-file=.env.local scripts/run-gemini.ts");
  process.exit(1);
}

async function main() {
const only = new Set(process.argv.slice(2));
const now = new Date();
const rows: string[][] = [];
let disagreements = 0;

for (const m of SEED_MESSAGES) {
  if (only.size && !only.has(m.id)) continue;
  const r = analyzeWithRules(m, now);
  const t0 = Date.now();
  try {
    const { proposal: g, toolCalls, model: used } = await analyzeWithGemini(m, now);
    const ms = Date.now() - t0;
    const same = g.triage.category === r.triage.category && g.autoSend.kind === r.autoSend.kind;
    if (!same) disagreements++;
    rows.push([m.id, same ? "same" : "DIFF", `rules=${r.triage.category}/${r.autoSend.kind}`, `gemini=${g.triage.category}/${g.autoSend.kind}`, `${ms}ms`, `${toolCalls.length} tool calls`, `via ${used}`]);
    console.log("=".repeat(80));
    console.log(m.id, m.channel, "|", g.triage.summary);
    console.log("category:", g.triage.category, "| hotel:", g.triage.hotelId, "| booking:", g.bookingMatch.bookingId, "| urgency:", g.triage.urgency, "| conf:", g.confidence, "| autoSend:", g.autoSend.kind, g.autoSend.reason ? `(${g.autoSend.reason})` : "");
    console.log("tools:", toolCalls.map((c) => c.name).join(", ") || "none");
    for (const a of g.actions) console.log("  ACTION", JSON.stringify(a));
    console.log("  didNotPromise:", g.didNotPromise);
    console.log("  citations:", g.policyCitations.join(", "));
    console.log("--- draft ---\n" + g.draftReply);
  } catch (e) {
    disagreements++;
    rows.push([m.id, "ERROR", `rules=${r.triage.category}/${r.autoSend.kind}`, String(e).slice(0, 120), "", ""]);
  }
}

console.log("\n" + "=".repeat(80));
console.log(`Model ${MODEL} · ${rows.length} messages · ${disagreements} disagreement(s) with the rules engine`);
for (const row of rows) console.log(row.join("  "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
