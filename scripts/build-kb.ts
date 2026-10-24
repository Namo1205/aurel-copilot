// Builds the policy knowledge base from the hotel handbooks in docs/policies.
//
//   npx tsx --env-file=.env.local scripts/build-kb.ts        # with embeddings (needs GEMINI_API_KEY)
//   npx tsx scripts/build-kb.ts                              # text only; search falls back to keywords
//
// Each "## Section" with an "<!-- id: … · tags: … -->" line becomes one chunk. The
// output, src/lib/policies/kb.json, is committed so the app needs no key to read it.
import fs from "node:fs";
import path from "node:path";

const DOCS = path.resolve("docs/policies");
const OUT = path.resolve("src/lib/policies/kb.json");
const OUT_VECTORS = path.resolve("src/lib/policies/kb-vectors.json");
const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";
const DIMS = 768;

interface Chunk {
  id: string;
  hotelId: string;
  topic: string;
  text: string;
  tags: string[];
  source: string;
  vector?: number[];
}

function parseHandbook(file: string): Chunk[] {
  const md = fs.readFileSync(path.join(DOCS, file), "utf8").replace(/\r\n/g, "\n");
  const hotel = md.match(/^Hotel:\s*(\S+)/m)?.[1];
  if (!hotel) throw new Error(`${file}: missing "Hotel: <id>" line`);
  const chunks: Chunk[] = [];
  const sections = md.split(/^## /m).slice(1);
  for (const s of sections) {
    const [titleLine, ...rest] = s.split("\n");
    const body = rest.join("\n");
    const meta = body.match(/<!--\s*id:\s*([A-Z0-9-]+)\s*·\s*tags:\s*([^>]*?)\s*-->/);
    if (!meta) throw new Error(`${file} › ${titleLine}: missing "<!-- id: … · tags: … -->" line`);
    const text = body
      .replace(/<!--[\s\S]*?-->/g, "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join(" ");
    chunks.push({
      id: meta[1],
      hotelId: hotel,
      topic: titleLine.trim(),
      text,
      tags: meta[2].split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
      source: `docs/policies/${file}#${titleLine.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    });
  }
  return chunks;
}

async function embedAll(chunks: Chunk[]): Promise<void> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.log("No GEMINI_API_KEY: writing text only, search will use keywords.");
    return;
  }
  // The embedding text names the hotel and topic so "pets in Lisbon" lands on the right chunk.
  const hotelName = (id: string) => (id === "all" ? "all Aurel hotels" : `Aurel ${{ LIS: "Lisboa", MAD: "Madrid", ROM: "Roma", ATH: "Athens", COM: "Comporta", MLL: "Mallorca", AMF: "Amalfi", SAN: "Santorini", ALG: "Algarve" }[id] ?? id}`);
  for (let i = 0; i < chunks.length; i += 50) {
    const batch = chunks.slice(i, i + 50);
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requests: batch.map((c) => ({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text: `${hotelName(c.hotelId)} · ${c.topic}. ${c.text}` }] },
          taskType: "RETRIEVAL_DOCUMENT",
          title: `${hotelName(c.hotelId)} · ${c.topic}`,
          outputDimensionality: DIMS,
        })),
      }),
    });
    const j = (await r.json()) as { embeddings?: { values: number[] }[]; error?: { message: string } };
    if (!r.ok || !j.embeddings) throw new Error(`embedding failed: ${j.error?.message ?? r.status}`);
    j.embeddings.forEach((e, k) => (batch[k].vector = e.values.map((v) => Math.round(v * 1e5) / 1e5)));
    console.log(`embedded ${Math.min(i + 50, chunks.length)}/${chunks.length}`);
  }
}

async function main() {
  const files = fs.readdirSync(DOCS).filter((f) => f.endsWith(".md")).sort();
  const chunks = files.flatMap(parseHandbook);
  const ids = new Set<string>();
  for (const c of chunks) {
    if (ids.has(c.id)) throw new Error(`duplicate id ${c.id}`);
    ids.add(c.id);
  }
  await embedAll(chunks);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const hasVectors = !!chunks[0]?.vector;
  fs.writeFileSync(
    OUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), model: hasVectors ? EMBED_MODEL : null, dims: hasVectors ? DIMS : null, chunks: chunks.map((c) => ({ id: c.id, hotelId: c.hotelId, topic: c.topic, text: c.text, tags: c.tags, source: c.source })) }, null, 0),
  );
  fs.writeFileSync(OUT_VECTORS, JSON.stringify({ model: hasVectors ? EMBED_MODEL : null, dims: hasVectors ? DIMS : null, vectors: Object.fromEntries(chunks.filter((c) => c.vector).map((c) => [c.id, c.vector])) }));
  const byHotel: Record<string, number> = {};
  for (const c of chunks) byHotel[c.hotelId] = (byHotel[c.hotelId] ?? 0) + 1;
  console.log(`wrote ${OUT} and ${OUT_VECTORS}: ${chunks.length} sections from ${files.length} handbooks`, byHotel, hasVectors ? `· ${DIMS}-dim vectors` : "· no vectors");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
