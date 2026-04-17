import { NextResponse } from "next/server";

export const runtime = "nodejs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

let cache: { ts: number; data: Recipe[] } | null = null;
const CACHE_TTL = 30 * 60 * 1000;

interface Recipe {
  title: string;
  url: string;
  image: string | null;
  time: string;
}

/** Parse Jina Reader markdown output — returns lines like [Title](url) */
function parseJinaMarkdown(md: string): Recipe[] {
  const recipes: Recipe[] = [];
  const seen = new Set<string>();

  // Match markdown links whose URL contains eatingwell.com and looks like a recipe
  const re = /\[([^\]]{5,120})\]\((https:\/\/www\.eatingwell\.com\/[^\)]+)\)/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(md)) !== null) {
    const title = m[1].trim();
    const url = m[2].trim();

    // Skip navigation, category, and non-recipe links
    if (seen.has(url)) continue;
    if (/\/(recipes|articles|nutrition|healthy-eating|videos|slideshows|galleries|news|tips|)\/?$/.test(url)) continue;
    if (url.split("/").filter(Boolean).length < 4) continue;
    if (title.length < 5 || /^(recipes?|more|next|prev|see all|view|sign|log|subscribe|newsletter)/i.test(title)) continue;

    seen.add(url);
    recipes.push({ title, url, image: null, time: "" });
    if (recipes.length >= 24) break;
  }

  return recipes;
}

/** Parse raw HTML for recipe cards (fallback) */
function parseHtml(html: string): Recipe[] {
  const recipes: Recipe[] = [];
  const seen = new Set<string>();

  // Look for anchor tags pointing to recipe URLs
  const aRe = /<a[^>]+href="(https?:\/\/www\.eatingwell\.com\/[^"]+)"[^>]*>([\s\S]{0,600}?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = aRe.exec(html)) !== null) {
    const url = m[1];
    const block = m[2];

    if (seen.has(url)) continue;
    if (url.split("/").filter(Boolean).length < 4) continue;

    // Try to get title from alt or text
    const altMatch = /alt="([^"]{5,120})"/i.exec(block);
    const textMatch = block.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const title = altMatch?.[1] || (textMatch.length >= 5 ? textMatch.slice(0, 120) : "");
    if (!title) continue;

    const imgMatch = /src="([^"]+(?:\.jpg|\.jpeg|\.png|\.webp)[^"]*)"/i.exec(block);
    const timeMatch = /(\d+)\s*(?:min|hr)/i.exec(block);

    seen.add(url);
    recipes.push({
      title,
      url,
      image: imgMatch?.[1]?.split("?")[0] || null,
      time: timeMatch?.[0] || "",
    });
    if (recipes.length >= 24) break;
  }

  return recipes;
}

const FETCH_URLS = [
  "https://www.eatingwell.com/recipes/",
  "https://www.eatingwell.com/recipes/17929/",
];

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  // --- Try Jina Reader first (handles JS-rendered sites, returns clean markdown) ---
  for (const pageUrl of FETCH_URLS) {
    try {
      const res = await fetch(`https://r.jina.ai/${pageUrl}`, {
        headers: { "User-Agent": UA, Accept: "text/plain" },
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const md = await res.text();
        if (md.length > 500) {
          const recipes = parseJinaMarkdown(md);
          if (recipes.length >= 4) {
            cache = { ts: Date.now(), data: recipes };
            return NextResponse.json(recipes);
          }
        }
      }
    } catch (_) {}
  }

  // --- Fallback: direct HTML fetch ---
  for (const pageUrl of FETCH_URLS) {
    try {
      const res = await fetch(pageUrl, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(14000),
      });
      if (res.ok) {
        const html = await res.text();
        if (html.length > 1000) {
          const recipes = parseHtml(html);
          if (recipes.length >= 4) {
            cache = { ts: Date.now(), data: recipes };
            return NextResponse.json(recipes);
          }
        }
      }
    } catch (_) {}
  }

  return NextResponse.json({ error: "Could not load recipes from EatingWell" }, { status: 502 });
}
