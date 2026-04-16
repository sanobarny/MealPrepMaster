import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
];

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractOgImage(html: string): string | null {
  const m =
    html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  return m ? m[1] : null;
}

/** Extract the first schema.org Recipe block from page HTML */
function extractSchemaRecipe(html: string): object | null {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]);
      const items: any[] = Array.isArray(data)
        ? data
        : data["@graph"]
        ? data["@graph"]
        : [data];
      const recipe = items.find(
        (item) =>
          item["@type"] === "Recipe" ||
          (Array.isArray(item["@type"]) && item["@type"].includes("Recipe"))
      );
      if (recipe) return recipe;
    } catch (_) {}
  }
  return null;
}

async function tryFetch(url: string, ua: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": ua,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
    },
    signal: AbortSignal.timeout(14000),
  });
  if (!res.ok) return null;
  const html = await res.text();
  return html.length > 500 ? html : null;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url || !url.startsWith("http")) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  // --- Try 1: direct server-side fetch ---
  let html: string | null = null;
  try { html = await tryFetch(url, ua); } catch (_) {}

  // --- Try 2: Jina Reader (no Cloudflare issues, works for most recipe sites) ---
  if (!html) {
    try {
      const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
        headers: { "User-Agent": ua, Accept: "text/plain" },
        signal: AbortSignal.timeout(16000),
      });
      if (jinaRes.ok) {
        const t = await jinaRes.text();
        if (t && t.length > 300) {
          // Jina returns markdown — no HTML to parse, return as plain text
          return NextResponse.json({ text: t.slice(0, 22000), ogImg: null, schemaRecipe: null });
        }
      }
    } catch (_) {}
  }

  if (!html) {
    return NextResponse.json({ error: "Could not fetch page" }, { status: 502 });
  }

  const ogImg = extractOgImage(html);
  const schemaRecipe = extractSchemaRecipe(html);
  const text = stripHtml(html).slice(0, 22000);

  return NextResponse.json({ text, ogImg, schemaRecipe });
}
