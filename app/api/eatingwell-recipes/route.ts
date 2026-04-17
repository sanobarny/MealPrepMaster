import { NextResponse } from "next/server";

export const runtime = "nodejs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Simple in-process cache — revalidate every 30 minutes
let cache: { ts: number; data: Recipe[] } | null = null;
const CACHE_TTL = 30 * 60 * 1000;

interface Recipe {
  title: string;
  url: string;
  image: string | null;
  description: string;
  time: string;
}

function parseRecipes(html: string): Recipe[] {
  const recipes: Recipe[] = [];
  const seen = new Set<string>();

  // Match recipe card links — eatingwell uses /recipe-name_XXXXXXX/ slugs
  const cardRe = /<a[^>]+href="(https?:\/\/www\.eatingwell\.com\/[^"]+)"[^>]*>[\s\S]{0,2000}?<\/a>/gi;
  const titleRe = /class="[^"]*card[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div|h[1-6])/i;
  const imgRe = /<img[^>]+src="([^"]+(?:eatingwell|dotdash|meredith)[^"]*)"[^>]*(?:alt="([^"]*)")?/i;
  const timeRe = /(\d+)\s*(?:min|minutes?|hrs?|hours?)/i;
  const descRe = /class="[^"]*(?:card__summary|card__description|card__byline)[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div|span)/i;

  let m: RegExpExecArray | null;
  while ((m = cardRe.exec(html)) !== null) {
    const url = m[0].includes("/recipes/") ? m[1] : null;
    if (!url || seen.has(url)) continue;

    const block = m[0];
    const titleMatch = titleRe.exec(block);
    const imgMatch = imgRe.exec(block);
    const timeMatch = timeRe.exec(block);
    const descMatch = descRe.exec(block);

    const title = titleMatch
      ? titleMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
      : imgMatch?.[2]?.trim() || "";

    if (!title || title.length < 4) continue;
    seen.add(url);

    const image = imgMatch ? imgMatch[1].split("?")[0] : null;
    const description = descMatch
      ? descMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
      : "";
    const time = timeMatch ? timeMatch[0].trim() : "";

    recipes.push({ title, url, image, description, time });
    if (recipes.length >= 24) break;
  }

  return recipes;
}

export async function GET() {
  // Return cache if fresh
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  let html = "";
  const urls = [
    "https://www.eatingwell.com/recipes/",
    "https://www.eatingwell.com/recipes/17929/",
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
        },
        signal: AbortSignal.timeout(14000),
      });
      if (res.ok) {
        html = await res.text();
        if (html.length > 1000) break;
      }
    } catch (_) {}
  }

  if (!html) {
    return NextResponse.json({ error: "Could not fetch recipes" }, { status: 502 });
  }

  const recipes = parseRecipes(html);

  if (recipes.length === 0) {
    return NextResponse.json({ error: "No recipes parsed" }, { status: 502 });
  }

  cache = { ts: Date.now(), data: recipes };
  return NextResponse.json(recipes);
}
