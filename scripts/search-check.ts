// Shows what the policy search returns for paraphrased guest questions, keyword
// and meaning-based side by side. Needs GEMINI_API_KEY for the meaning-based column.
//   npx tsx --env-file=.env.local scripts/search-check.ts
import { searchPolicies } from "../src/lib/pms";
import { searchPoliciesSmart, semanticAvailable, KB_INFO } from "../src/lib/policies";

const CASES: [string | null, string][] = [
  ["LIS", "can my dog come with me"],
  ["SAN", "is there somewhere to work out"],
  ["ROM", "our flight lands at 6am, can we get into the room"],
  ["MLL", "my daughter has a severe nut allergy"],
  ["COM", "how do we get from the airport"],
  ["ATH", "where can I leave the car"],
  ["MAD", "we're celebrating our 10th anniversary"],
  ["ALG", "do you have a kids club"],
  ["AMF", "I need a step-free room"],
  ["SAN", "can we bring our 6 year old"],
  ["LIS", "I was quoted less on Booking.com"],
  ["ROM", "what time do I have to leave the room"],
];

async function main() {
  console.log(`knowledge base: ${KB_INFO.sections} sections · model ${KB_INFO.model ?? "none"} · semantic ${semanticAvailable() ? "on" : "off"}\n`);
  let misses = 0;
  for (const [hotel, q] of CASES) {
    const kw = searchPolicies(hotel, q).map((p) => p.id);
    const sm = await searchPoliciesSmart(hotel, q);
    const smIds = sm.map((h) => `${h.id}(${h.score})`);
    if (!sm.length) misses++;
    console.log(`${hotel} · "${q}"`);
    console.log(`   keyword : ${kw.join(", ") || "—"}`);
    console.log(`   semantic: ${smIds.join(", ") || "—"}`);
  }
  console.log(`\n${CASES.length - misses}/${CASES.length} questions found at least one section`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
