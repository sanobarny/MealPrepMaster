import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Rotate through several User-Agent strings to avoid basic bot-detection
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

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url || !url.startsWith("http")) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  // --- Try 1: direct fetch ---
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": ua,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      signal: AbortSignal.timeout(12000),
      // @ts-ignore – undici/Node fetch option
      redirect: "follow",
    });

    if (res.ok) {
      const html = await res.text();
      if (html.length > 500) {
        return NextResponse.json({
          text: stripHtml(html).slice(0, 20000),
          ogImg: extractOgImage(html),
        });
      }
    }
  } catch (_) {}

  // --- Try 2: Jina Reader (server-side, no CORS issue) ---
  try {
    const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        "User-Agent": ua,
        Accept: "text/plain",
      },
      signal: AbortSignal.timeout(14000),
    });
    if (jinaRes.ok) {
      const text = await jinaRes.text();
      if (text && text.length > 300) {
        return NextResponse.json({ text: text.slice(0, 20000), ogImg: null });
      }
    }
  } catch (_) {}

  return NextResponse.json({ error: "Could not fetch page" }, { status: 502 });
}
