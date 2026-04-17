import { NextResponse } from "next/server";

export const runtime = "nodejs";

const UA = "Mozilla/5.0 (compatible; MealPrepMaster/1.0)";

let cache: { ts: number; data: Recipe[] } | null = null;
const CACHE_TTL = 30 * 60 * 1000;

export interface Recipe {
  title: string;
  url: string;
  image: string | null;
  description: string;
  source: string;
}

const SOURCES: { name: string; rss: string }[] = [
  { name: "EatingWell",        rss: "https://www.eatingwell.com/feed/" },
  { name: "Skinnytaste",       rss: "https://www.skinnytaste.com/feed/" },
  { name: "Love & Lemons",     rss: "https://www.loveandlemons.com/feed/" },
  { name: "Cookie & Kate",     rss: "https://cookieandkate.com/feed/" },
  { name: "Budget Bytes",      rss: "https://www.budgetbytes.com/feed/" },
  { name: "Feel Good Foodie",  rss: "https://feelgoodfoodie.net/feed/" },
  { name: "Forks Over Knives", rss: "https://www.forksoverknives.com/feed/" },
];

function text(xml: string, tag: string): string {
  const m = new RegExp(`<${tag}[^>]*>(?:<\\!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i").exec(xml);
  return m ? m[1].trim() : "";
}

function parseRss(xml: string, sourceName: string, limit = 5): Recipe[] {
  const items: Recipe[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;

  while ((m = itemRe.exec(xml)) !== null && items.length < limit) {
    const block = m[1];
    const title = text(block, "title").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#\d+;/g, "");
    const url   = text(block, "link") || (/<link>([\s\S]*?)<\/link>/i.exec(block)?.[1] ?? "");
    if (!title || !url) continue;

    // Image: try media:content, enclosure, or og:image in content
    const imgM =
      /media:content[^>]+url="([^"]+)"/i.exec(block) ||
      /enclosure[^>]+url="([^"]+)"/i.exec(block) ||
      /<img[^>]+src="([^"]+)"/i.exec(block);
    const image = imgM ? imgM[1].split("?")[0] : null;

    // Description: strip HTML tags
    const rawDesc = text(block, "description") || text(block, "content:encoded");
    const description = rawDesc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);

    items.push({ title, url, image, description, source: sourceName });
  }

  return items;
}

async function fetchSource(src: typeof SOURCES[0]): Promise<Recipe[]> {
  try {
    const res = await fetch(src.rss, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml, */*" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRss(xml, src.name, 5);
  } catch {
    return [];
  }
}

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  const results = await Promise.allSettled(SOURCES.map(fetchSource));
  const all: Recipe[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
  }

  if (all.length === 0) {
    return NextResponse.json({ error: "Could not load recipes" }, { status: 502 });
  }

  // Interleave so sources alternate
  const bySource: Record<string, Recipe[]> = {};
  for (const r of all) (bySource[r.source] = bySource[r.source] || []).push(r);
  const interleaved: Recipe[] = [];
  const max = Math.max(...Object.values(bySource).map(a => a.length));
  for (let i = 0; i < max; i++) {
    for (const arr of Object.values(bySource)) {
      if (arr[i]) interleaved.push(arr[i]);
    }
  }

  cache = { ts: Date.now(), data: interleaved };
  return NextResponse.json(interleaved);
}
