import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "jsr:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const PIPELINE_KEY = Deno.env.get("PIPELINE_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ─── User-Agent rotation ───
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ─── Source type detection ───
function detectSourceType(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("reddit.com") || u.includes("old.reddit.com")) return "reddit";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  return "article";
}

// ─── HTML → text extraction (no external deps) ───
function htmlToText(html: string): string {
  // Remove script/style blocks
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, "");
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, "");
  text = text.replace(/<header[\s\S]*?<\/header>/gi, "");

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";

  // Extract meta description
  const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i);
  const metaDesc = metaMatch ? metaMatch[1].trim() : "";

  // Replace common block elements with newlines
  text = text.replace(/<(\/?(h[1-6]|p|div|br|li|tr|blockquote))[^>]*>/gi, "\n");
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, " ");
  // Decode common entities
  text = text.replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  // Collapse whitespace
  text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  // Prepend title and meta if found
  const prefix = [title && `Title: ${title}`, metaDesc && `Description: ${metaDesc}`]
    .filter(Boolean).join("\n");
  return prefix ? `${prefix}\n\n${text}` : text;
}

// ─── Reddit JSON fallback ───
async function fetchRedditJson(url: string): Promise<{ text: string; method: string } | null> {
  try {
    const jsonUrl = url.replace(/\/?$/, ".json");
    const resp = await fetch(jsonUrl, {
      headers: { "User-Agent": randomUA(), Accept: "application/json" },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const posts: string[] = [];

    // Handle listing (subreddit) or thread
    const listings = Array.isArray(data) ? data : [data];
    for (const listing of listings) {
      const children = listing?.data?.children || [];
      for (const child of children.slice(0, 25)) {
        const d = child.data;
        if (d?.title) posts.push(`## ${d.title}`);
        if (d?.selftext) posts.push(d.selftext.slice(0, 1000));
        if (d?.body) posts.push(d.body.slice(0, 1000));
        posts.push("");
      }
    }
    if (posts.length === 0) return null;
    return { text: posts.join("\n").slice(0, 15000), method: "reddit_json" };
  } catch {
    return null;
  }
}

// ─── YouTube metadata extraction ───
function extractYouTubeInfo(html: string): string {
  const parts: string[] = [];
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (titleMatch) parts.push(`Title: ${titleMatch[1].replace(" - YouTube", "").trim()}`);

  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i);
  if (descMatch) parts.push(`Description: ${descMatch[1].trim()}`);

  // Extract tags from keywords meta
  const kwMatch = html.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([\s\S]*?)["']/i);
  if (kwMatch) parts.push(`Keywords: ${kwMatch[1].trim()}`);

  return parts.join("\n") || htmlToText(html);
}

// ─── Static fetch with retries ───
async function staticFetch(url: string, retries = 2): Promise<{ html: string; ok: boolean }> {
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": randomUA(),
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
      });
      if (resp.ok) {
        const html = await resp.text();
        if (html.length > 500) return { html, ok: true };
      }
    } catch {
      // retry
    }
    if (i < retries) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  return { html: "", ok: false };
}

// ─── Perplexity fallback for blocked pages ───
async function perplexityFallback(url: string): Promise<{ text: string; method: string } | null> {
  const PERPLEXITY_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  if (!PERPLEXITY_KEY) return null;

  try {
    const resp = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content: "Extract the full content from this URL. Return the article title, all main text, and key points. Be comprehensive.",
          },
          { role: "user", content: `Extract all content from: ${url}` },
        ],
        max_tokens: 4000,
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content;
    if (text && text.length > 100) return { text, method: "perplexity" };
  } catch {
    // fall through
  }
  return null;
}

// ─── OpenAI structured extraction ───
async function extractWithAI(text: string, sourceType: string, url: string): Promise<Record<string, unknown>> {
  const systemPrompt = `You are a content intelligence extractor for a short-form video content engine.

Extract structured data from the provided content. Focus on:
- Topics and themes that could become viral short-form videos
- Hook patterns: extract BOTH a typed category AND a specific example
- Emotional triggers that drive engagement
- Content format patterns
- Visual style suggestions for video production
- Key facts or talking points

CRITICAL SCORING RULES FOR viral_score:
You MUST distribute scores across the full 20-95 range. Do NOT cluster scores.
Use this rubric strictly:
- 90-95: Genuinely explosive. Topic is breaking NOW, has massive emotional pull, AND high shareability. Very rare.
- 75-89: Strong viral potential. Timely topic with clear emotional hook and broad appeal.
- 55-74: Moderate potential. Interesting topic but either not timely, narrow audience, or weak emotional pull.
- 35-54: Low potential. Evergreen or niche content. Useful but unlikely to go viral.
- 20-34: Minimal potential. Too generic, too old, or too narrow to drive engagement.

Score based on: (1) timeliness — is this happening NOW? (2) emotional intensity — does it provoke a strong reaction? (3) shareability — would someone send this to a friend? (4) novelty — has this been covered to death already? (5) controversy — does it spark debate?

Source type: ${sourceType}
Source URL: ${url}`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text.slice(0, 12000) },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "store_content_insights",
            description: "Store extracted content insights",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "Title or headline" },
                topics: {
                  type: "array",
                  items: { type: "string" },
                  description: "Main topics/themes (3-8). Use normalized lowercase terms.",
                },
                hook_patterns: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: {
                        type: "string",
                        enum: ["statistic_shock", "question_challenge", "myth_bust", "fear_warning", "curiosity_gap", "contrarian_claim", "social_proof", "urgency", "story_tease", "authority_reveal"],
                        description: "Hook pattern category",
                      },
                      example: { type: "string", description: "Specific hook text example (under 80 chars)" },
                    },
                    required: ["type", "example"],
                  },
                  description: "2-5 hook patterns with typed categories and specific examples",
                },
                emotional_triggers: {
                  type: "array",
                  items: {
                    type: "string",
                    enum: ["curiosity", "fear", "surprise", "outrage", "hope", "nostalgia", "amusement", "awe", "anxiety", "empathy", "pride", "disgust", "relief", "urgency", "belonging"],
                  },
                  description: "2-4 emotional triggers. Be specific — don't default to curiosity+fear for everything.",
                },
                content_format: {
                  type: "string",
                  enum: ["listicle", "myth_busting", "story", "tutorial", "comparison", "hot_take", "explainer", "warning", "behind_the_scenes", "reaction", "challenge"],
                  description: "Best content format for a short-form video",
                },
                visual_style: {
                  type: "string",
                  enum: ["cinematic", "documentary", "fast_cuts", "text_overlay", "animation", "screencast", "talking_head", "b_roll_montage"],
                  description: "Suggested visual style for video",
                },
                key_points: {
                  type: "array",
                  items: { type: "string" },
                  description: "Key facts or talking points (3-6)",
                },
                viral_score: {
                  type: "integer",
                  description: "Viral potential 20-95. MUST follow the scoring rubric. Do NOT default to 80-85.",
                },
                novelty_level: {
                  type: "string",
                  enum: ["breaking", "emerging", "established", "evergreen", "saturated"],
                  description: "How new/fresh is this topic? breaking=hours old, saturated=overdone",
                },
                controversy_level: {
                  type: "string",
                  enum: ["none", "mild", "moderate", "high", "extreme"],
                  description: "Does this topic spark debate?",
                },
                relevance_tags: {
                  type: "array",
                  items: { type: "string" },
                  description: "Tags for matching to verticals: privacy, education, health, tech, finance, lifestyle, etc.",
                },
              },
              required: ["title", "topics", "hook_patterns", "content_format", "key_points", "viral_score", "novelty_level", "controversy_level", "relevance_tags", "emotional_triggers"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "store_content_insights" } },
      temperature: 0.3,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(\`OpenAI extraction failed: \${resp.status} \${err}\`);
  }

  const data = await resp.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("No tool call in OpenAI response");

  return JSON.parse(toolCall.function.arguments);
}

// ─── Main handler ───
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("authorization") || "";
    const pipelineKey = req.headers.get("x-pipeline-key") || "";
    const isServiceCall = pipelineKey === PIPELINE_KEY;

    if (!isServiceCall && authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        console.warn("Auth failed, proceeding anyway for dev mode");
      }
    }

    const body = await req.json();
    const { url, urls } = body as { url?: string; urls?: string[] };

    // Support single or batch
    const targetUrls = urls || (url ? [url] : []);
    if (targetUrls.length === 0) {
      return new Response(JSON.stringify({ error: "url or urls required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (targetUrls.length > 10) {
      return new Response(JSON.stringify({ error: "Max 10 URLs per request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];

    for (const targetUrl of targetUrls) {
      const sourceType = detectSourceType(targetUrl);
      const fetchStart = Date.now();

      // Create job record
      const { data: job } = await supabase
        .from("scrape_jobs")
        .insert({ url: targetUrl, source_type: sourceType, status: "fetching" })
        .select("id")
        .single();

      const jobId = job?.id;

      try {
        let rawText = "";
        let fetchMethod = "static";

        // Strategy 1: Reddit JSON API
        if (sourceType === "reddit") {
          const redditResult = await fetchRedditJson(targetUrl);
          if (redditResult) {
            rawText = redditResult.text;
            fetchMethod = redditResult.method;
          }
        }

        // Strategy 2: Static HTML fetch
        if (!rawText) {
          const { html, ok } = await staticFetch(targetUrl);
          if (ok) {
            rawText = sourceType === "youtube" ? extractYouTubeInfo(html) : htmlToText(html);
            fetchMethod = "static";

            // Store raw HTML (truncated)
            if (jobId) {
              await supabase
                .from("scrape_jobs")
                .update({ raw_html: html.slice(0, 50000) })
                .eq("id", jobId);
            }
          }
        }

        // Strategy 3: Perplexity fallback
        if (!rawText || rawText.length < 200) {
          const fallback = await perplexityFallback(targetUrl);
          if (fallback) {
            rawText = fallback.text;
            fetchMethod = fallback.method;
          }
        }

        const fetchDuration = Date.now() - fetchStart;

        if (!rawText || rawText.length < 50) {
          if (jobId) {
            await supabase
              .from("scrape_jobs")
              .update({
                status: "failed",
                error: "Could not extract meaningful content",
                fetch_method: fetchMethod,
                fetch_duration_ms: fetchDuration,
              })
              .eq("id", jobId);
          }
          results.push({ url: targetUrl, status: "failed", error: "No content extracted" });
          continue;
        }

        // Update job status
        if (jobId) {
          await supabase
            .from("scrape_jobs")
            .update({
              status: "extracting",
              raw_text: rawText.slice(0, 30000),
              fetch_method: fetchMethod,
              fetch_duration_ms: fetchDuration,
            })
            .eq("id", jobId);
        }

        // AI extraction
        const extractStart = Date.now();
        const extracted = await extractWithAI(rawText, sourceType, targetUrl);
        const extractDuration = Date.now() - extractStart;

        // Store insight
        if (jobId) {
          // hook_patterns now come as objects {type, example} — store the typed array as JSON
          const hookPatterns = Array.isArray(extracted.hook_patterns)
            ? (extracted.hook_patterns as Array<{type?: string; example?: string} | string>).map(h =>
                typeof h === "object" && h !== null ? `${h.type || "unknown"}: ${h.example || ""}` : String(h)
              )
            : [];

          await supabase.from("scraped_insights").insert({
            scrape_job_id: jobId,
            source_url: targetUrl,
            source_type: sourceType,
            title: extracted.title as string || null,
            topics: (extracted.topics as string[]) || [],
            hook_patterns: hookPatterns,
            emotional_triggers: (extracted.emotional_triggers as string[]) || [],
            content_format: (extracted.content_format as string) || null,
            visual_style: (extracted.visual_style as string) || null,
            key_points: (extracted.key_points as string[]) || [],
            viral_score: (extracted.viral_score as number) || null,
            relevance_tags: (extracted.relevance_tags as string[]) || [],
            novelty_level: (extracted.novelty_level as string) || null,
            controversy_level: (extracted.controversy_level as string) || null,
            raw_extraction: extracted,
          });

          await supabase
            .from("scrape_jobs")
            .update({
              status: "done",
              extracted_json: extracted,
              extraction_duration_ms: extractDuration,
              completed_at: new Date().toISOString(),
            })
            .eq("id", jobId);
        }

        results.push({
          url: targetUrl,
          status: "done",
          job_id: jobId,
          source_type: sourceType,
          fetch_method: fetchMethod,
          insights: extracted,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        if (jobId) {
          await supabase
            .from("scrape_jobs")
            .update({ status: "failed", error: errorMsg })
            .eq("id", jobId);
        }
        results.push({ url: targetUrl, status: "failed", error: errorMsg });
      }
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("scrape-content error:", errorMsg);
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
