import { NextResponse } from "next/server";

export const runtime = "nodejs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

let cache: { ts: number; data: Recipe[] } | null = null;
const CACHE_TTL = 30 * 60 * 1000;

export interface Recipe {
  title: string;
  url: string;
  image: string | null;
  time: string;
  source: string;
}

const SOURCES: { name: string; url: string; domain: string }[] = [
  { name: "EatingWell",       url: "https://www.eatingwell.com/recipes/",       domain: "eatingwell.com" },
  { name: "Skinnytaste",      url: "https://www.skinnytaste.com/recipes/",       domain: "skinnytaste.com" },
  { name: "Love & Lemons",    url: "https://www.loveandlemons.com/recipes/",     domain: "loveandlemons.com" },
  { name: "Cookie & Kate",    url: "https://cookieandkate.com/",                 domain: "cookieandkate.com" },
  { name: "Budget Bytes",     url: "https://www.budgetbytes.com/",               domain: "budgetbytes.com" },
  { name: "Feel Good Foodie", url: "https://feelgoodfoodie.net/recipe/",         domain: "feelgoodfoodie.net" },
  { name: "Forks Over Knives",url: "https://www.forksoverknives.com/recipes/",   domain: "forksoverknives.com" },
];

const SKIP_TITLE = /^(recipes?|more|next|prev|see all|view|sign|log|subscribe|newsletter|home|about|contact|search|category|tag|jump to|skip)/i;
const SKIP_PATH  = /^\/(recipes?|articles?|nutrition|healthy-eating|videos?|slideshows?|galleries?|news|tips?|blog|about|contact|search|category|tag)?\/?$/;

function isRecipeUrl(url: string, domain: string): boolean {
  try {
    const u = new URL(url);
    if (!u.hostname.includes(domain)) return false;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 1) return false;
    if (SKIP_PATH.test(u.pathname)) return false;
    return true;
  } catch { return false; }
}

function parseJina(md: string, domain: string, sourceName: string, limit = 6): Recipe[] {
  const recipes: Recipe[] = [];
  const seen = new Set<string>();
  const re = /\[([^\]]{5,120})\]\((https?:\/\/[^\)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const title = m[1].trim();
    const url   = m[2].trim().split("?")[0];
    if (seen.has(url) || !isRecipeUrl(url, domain)) continue;
    if (title.length < 5 || SKIP_TITLE.test(title)) continue;
    seen.add(url);
    recipes.push({ title, url, image: null, time: "", source: sourceName });
    if (recipes.length >= limit) break;
  }
  return recipes;
}

async function fetchSource(source: typeof SOURCES[0]): Promise<Recipe[]> {
  // Try Jina Reader — handles JS-rendered pages, returns clean markdown
  try {
    const res = await fetch(`https://r.jina.ai/${source.url}`, {
      headers: { "User-Agent": UA, Accept: "text/plain" },
      signal: AbortSignal.timeout(18000),
    });
    if (res.ok) {
      const md = await res.text();
      if (md.length > 300) {
        const recipes = parseJina(md, source.domain, source.name, 6);
        if (recipes.length >= 2) return recipes;
      }
    }
  } catch (_) {}
  return [];
}

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  // Fetch all sources in parallel
  const results = await Promise.allSettled(SOURCES.map(fetchSource));
  const all: Recipe[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
  }

  if (all.length === 0) {
    return NextResponse.json({ error: "Could not load recipes" }, { status: 502 });
  }

  // Interleave sources so no single site dominates
  const bySource: Record<string, Recipe[]> = {};
  for (const r of all) {
    (bySource[r.source] = bySource[r.source] || []).push(r);
  }
  const interleaved: Recipe[] = [];
  const maxPerSource = Math.max(...Object.values(bySource).map(a => a.length));
  for (let i = 0; i < maxPerSource; i++) {
    for (const src of Object.values(bySource)) {
      if (src[i]) interleaved.push(src[i]);
    }
  }

  cache = { ts: Date.now(), data: interleaved };
  return NextResponse.json(interleaved);
}
