import { prisma } from "../utils/prisma.js";

/**
 * FAQs are editable rows in PostgreSQL (hostel_faqs), seeded for development.
 * Cached in memory for 60s so chat replies don't hit the DB on every message,
 * while admin edits still appear quickly.
 */
let cache = { at: 0, rows: [] };
const TTL_MS = 60_000;

export async function getPublishedFaqs({ refresh = false } = {}) {
  if (!refresh && cache.rows.length && Date.now() - cache.at < TTL_MS) return cache.rows;
  const rows = await prisma.hostelFAQ.findMany({
    where: { isPublished: true },
    orderBy: { question: "asc" },
  });
  cache = { at: Date.now(), rows };
  return rows;
}

export function invalidateFaqCache() {
  cache = { at: 0, rows: [] };
}

/** Simple keyword-overlap scoring against FAQ keywords + question words. */
export function matchFaq(rows, text) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (words.length === 0) return null;

  let best = null;
  let bestScore = 0;
  for (const faq of rows) {
    let score = 0;
    const qWords = faq.question.toLowerCase().split(/\s+/);
    for (const w of words) {
      if (faq.keywords.some((k) => k.toLowerCase() === w)) score += 3;
      else if (faq.keywords.some((k) => k.toLowerCase().includes(w) || w.includes(k.toLowerCase()))) score += 2;
      if (qWords.some((q) => q.includes(w))) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = faq;
    }
  }
  // Require a minimum confidence so unrelated chatter doesn't grab a random FAQ.
  return bestScore >= 4 ? best : null;
}
