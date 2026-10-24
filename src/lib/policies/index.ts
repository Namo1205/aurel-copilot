// The policy knowledge base: hotel handbooks (docs/policies/*.md) chunked by section
// and embedded at build time into kb.json. Two ways to search it:
//   searchPolicies      keyword scoring, synchronous, works with no key (in @/lib/pms)
//   searchPoliciesSmart meaning-based with the keyword score as tiebreaker; falls back
//                       to keywords when there is no key or the embedding call fails.
import kb from "./kb.json";
import kbVectors from "./kb-vectors.json";
import { searchPolicies, type Policy } from "@/lib/pms";

interface Chunk extends Policy {
  source: string;
  vector?: number[];
}

const VECTORS = kbVectors.vectors as Record<string, number[]>;
const CHUNKS: Chunk[] = (kb.chunks as Omit<Chunk, "vector">[]).map((c) => ({ ...c, vector: VECTORS[c.id] }));
export const KB_INFO = { generatedAt: kb.generatedAt as string, model: kb.model as string | null, dims: kb.dims as number | null, sections: CHUNKS.length };
export const SOURCE_BY_ID: Record<string, string> = Object.fromEntries(CHUNKS.map((c) => [c.id, c.source]));

const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || (kb.model as string | null) || "gemini-embedding-001";
const queryCache = new Map<string, number[]>();

export function semanticAvailable(): boolean {
  return !!process.env.GEMINI_API_KEY && !!kb.dims && CHUNKS.some((c) => c.vector);
}

async function embedQuery(text: string): Promise<number[]> {
  const hit = queryCache.get(text);
  if (hit) return hit;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: { parts: [{ text }] }, taskType: "RETRIEVAL_QUERY", outputDimensionality: kb.dims }),
  });
  const j = (await r.json()) as { embedding?: { values: number[] }; error?: { message: string } };
  if (!r.ok || !j.embedding) throw new Error(`query embedding failed: ${j.error?.message ?? r.status}`);
  queryCache.set(text, j.embedding.values);
  return j.embedding.values;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export interface SearchHit extends Policy {
  source: string;
  score: number;
  how: "semantic" | "keyword";
}

// Meaning-based search over the handbooks for one hotel (plus group-wide rules).
// Returns at most `limit` sections above a similarity floor, hotel-specific first
// when a group-wide section covers the same topic.
export async function searchPoliciesSmart(hotelId: string | null, query: string, limit = 4): Promise<SearchHit[]> {
  const keyword = searchPolicies(hotelId, query);
  if (!semanticAvailable()) return keyword.map((p) => ({ ...p, source: SOURCE_BY_ID[p.id] ?? "", score: 1, how: "keyword" as const }));
  let q: number[];
  try {
    q = await embedQuery(query);
  } catch {
    return keyword.map((p) => ({ ...p, source: SOURCE_BY_ID[p.id] ?? "", score: 1, how: "keyword" as const }));
  }
  const keywordRank = new Map(keyword.map((p, i) => [p.id, i]));
  const scored = CHUNKS.filter((c) => c.vector && (c.hotelId === "all" || !hotelId || c.hotelId === hotelId))
    .map((c) => {
      let score = cosine(q, c.vector!);
      if (keywordRank.has(c.id)) score += 0.08 - 0.01 * Math.min(keywordRank.get(c.id)!, 5); // tiebreaker, not a veto
      if (hotelId && c.hotelId === hotelId) score += 0.02;
      return { c, score };
    })
    .sort((a, b) => b.score - a.score);
  const top = scored[0]?.score ?? 0;
  const out: SearchHit[] = [];
  const topics = new Set<string>();
  for (const { c, score } of scored) {
    if (score < 0.55 || score < top - 0.12 || out.length >= limit) break;
    const key = c.topic.toLowerCase();
    if (topics.has(key) && c.hotelId === "all") continue;
    topics.add(key);
    out.push({ id: c.id, hotelId: c.hotelId, topic: c.topic, text: c.text, tags: c.tags, source: c.source, score: Math.round(score * 1000) / 1000, how: "semantic" });
  }
  return out;
}
