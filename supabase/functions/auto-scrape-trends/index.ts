/**
 * auto-scrape-trends
 * 
 * Scheduled function that automatically discovers and scrapes trending sources.
 * Designed to run daily via pg_cron.
 * 
 * Strategy:
 * 1. Pull verticals from account_configs
 * 2. For each vertical, search trending topics via Perplexity
 * 3. Extract source URLs from Perplexity citations
 * 4. Feed those URLs to scrape-content for structured extraction
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Vertical-specific search queries for trend discovery
const VERTICAL_QUERIES: Record<string, string[]> = {
  health: [
    "trending health topics on social media this week",
    "viral health myths debunked 2025",
    "most shared health facts on TikTok this week",
  ],
  privacy: [
    "trending privacy and security news this week",
    "viral data privacy stories social media",
    "biggest surveillance and tracking stories this week",
  ],
  education: [
    "trending education topics on social media this week",
    "viral learning facts and study tips TikTok",
  ],
  finance: [
    "trending personal finance topics social media this week",
    "viral money saving tips TikTok this week",
  ],
  tech: [
    "trending tech news social media this week",
    "viral AI and technology stories this week",
  ],
};

// Fallback for unknown verticals
const DEFAULT_QUERIES = [
  "most viral short-form video topics this week",
  "trending content ideas for social media creators this week",
];

interface PerplexityResult {
  urls: string[];
  topics: string[];
}

async function discoverTrendingUrls(
  vertical: string,
  perplexityKey: string
): Promise<PerplexityResult> {
  const queries = VERTICAL_QUERIES[vertical] || DEFAULT_QUERIES;
  // Pick 1-2 random queries per vertical to avoid rate limits
  const selected = queries.sort(() => Math.random() - 0.5).slice(0, 2);

  const allUrls: string[] = [];
  const allTopics: string[] = [];

  for (const query of selected) {
    try {
      const resp = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${perplexityKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [
            {
              role: "system",
              content: `You are a trend researcher. Find the most viral and trending topics related to ${vertical} content. Return specific article URLs, Reddit threads, and YouTube videos that are getting attention right now. Focus on content that could inspire short-form viral videos.`,
            },
            { role: "user", content: query },
          ],
          max_tokens: 2000,
          search_recency_filter: "week",
        }),
      });

      if (!resp.ok) {
        console.warn(`[auto-scrape] Perplexity query failed: ${resp.status}`);
        continue;
      }

      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content || "";
      const citations = data.citations || [];

      // Collect citation URLs
      allUrls.push(...citations.filter((u: string) => u.startsWith("http")));

      // Extract URLs from the text content
      const urlRegex = /https?:\/\/[^\s)>\]"']+/g;
      const textUrls = content.match(urlRegex) || [];
      allUrls.push(...textUrls);

      // Extract topic keywords from content
      const topicLines = content.split("\n").filter((l: string) => l.trim().length > 10).slice(0, 5);
      allTopics.push(...topicLines.map((l: string) => l.replace(/^[\d\.\-\*]+\s*/, "").trim()).filter((t: string) => t.length > 5 && t.length < 200));

    } catch (err) {
      console.warn(`[auto-scrape] Query error:`, err);
    }
  }

  // Deduplicate and filter URLs
  const uniqueUrls = [...new Set(allUrls)]
    .filter(u => {
      try {
        const url = new URL(u);
        // Skip search engine results, login pages, etc.
        const skip = ["google.com/search", "bing.com/search", "accounts.google"];
        return !skip.some(s => url.href.includes(s));
      } catch { return false; }
    })
    .slice(0, 8); // Cap at 8 URLs per vertical

  return { urls: uniqueUrls, topics: [...new Set(allTopics)].slice(0, 10) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY");
    const pipelineKey = Deno.env.get("PIPELINE_KEY");

    if (!perplexityKey) {
      return new Response(
        JSON.stringify({ error: "PERPLEXITY_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get active verticals from account_configs
    const { data: accounts } = await supabase
      .from("account_configs")
      .select("vertical")
      .limit(20);

    const verticals = [...new Set((accounts || []).map(a => a.vertical))];
    if (verticals.length === 0) {
      verticals.push("health", "privacy"); // fallback defaults
    }

    console.log(`[auto-scrape] Starting for verticals: ${verticals.join(", ")}`);

    const results: Array<{ vertical: string; urls_found: number; urls_scraped: number }> = [];
    let totalScraped = 0;

    for (const vertical of verticals) {
      // Discover trending URLs via Perplexity
      const { urls } = await discoverTrendingUrls(vertical, perplexityKey);
      console.log(`[auto-scrape] ${vertical}: found ${urls.length} URLs`);

      if (urls.length === 0) {
        results.push({ vertical, urls_found: 0, urls_scraped: 0 });
        continue;
      }

      // Check which URLs we've already scraped (avoid duplicates)
      const { data: existing } = await supabase
        .from("scrape_jobs")
        .select("url")
        .in("url", urls);

      const existingUrls = new Set((existing || []).map(e => e.url));
      const newUrls = urls.filter(u => !existingUrls.has(u));

      if (newUrls.length === 0) {
        console.log(`[auto-scrape] ${vertical}: all URLs already scraped`);
        results.push({ vertical, urls_found: urls.length, urls_scraped: 0 });
        continue;
      }

      // Send to scrape-content in batches of 5
      const batches = [];
      for (let i = 0; i < newUrls.length; i += 5) {
        batches.push(newUrls.slice(i, i + 5));
      }

      let scraped = 0;
      for (const batch of batches) {
        try {
          const scrapeResp = await fetch(`${supabaseUrl}/functions/v1/scrape-content`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${supabaseServiceKey}`,
              "Content-Type": "application/json",
              ...(pipelineKey ? { "x-pipeline-key": pipelineKey } : {}),
            },
            body: JSON.stringify({ urls: batch }),
          });

          if (scrapeResp.ok) {
            const scrapeData = await scrapeResp.json();
            const doneCount = (scrapeData.results || []).filter((r: { status: string }) => r.status === "done").length;
            scraped += doneCount;
          } else {
            console.warn(`[auto-scrape] Scrape batch failed: ${scrapeResp.status}`);
          }
        } catch (err) {
          console.warn(`[auto-scrape] Scrape batch error:`, err);
        }

        // Small delay between batches to be polite
        await new Promise(r => setTimeout(r, 2000));
      }

      totalScraped += scraped;
      results.push({ vertical, urls_found: urls.length, urls_scraped: scraped });
      console.log(`[auto-scrape] ${vertical}: scraped ${scraped}/${newUrls.length} new URLs`);
    }

    // Optionally trigger idea generation if we got enough new data
    if (totalScraped >= 3) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/generate-ideas`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ count: 5, mode: "auto" }),
        });
        console.log(`[auto-scrape] Triggered idea generation after ${totalScraped} new scrapes`);
      } catch (err) {
        console.warn(`[auto-scrape] Idea generation trigger failed:`, err);
      }
    }

    console.log(`[auto-scrape] Complete. Total scraped: ${totalScraped}`);

    return new Response(
      JSON.stringify({ success: true, total_scraped: totalScraped, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[auto-scrape] Error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
