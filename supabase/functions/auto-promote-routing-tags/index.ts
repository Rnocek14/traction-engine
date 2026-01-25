import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Blocklist of generic tags that should never be promoted
const PROMOTION_BLOCKLIST = new Set([
  "video", "scene", "shot", "camera", "person", "people", 
  "man", "woman", "thing", "object", "background", "foreground",
  "left", "right", "center", "top", "bottom", "frame",
  "the", "a", "an", "this", "that", "it", "clip", "footage",
  "image", "picture", "movie", "film", "content", "media", "visual"
]);

// Same normalization as frontend/backend shared utils
function normalizeRoutingTag(tag: string): string {
  return tag
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function validateCronAuth(req: Request): boolean {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) {
    console.error("[auto-promote] CRON_SECRET not configured");
    return false;
  }
  const headerSecret = req.headers.get("x-cron-secret");
  return headerSecret === cronSecret;
}

interface PromotionCandidate {
  raw_tag: string;
  n: number;
  providers: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate cron auth
    if (!validateCronAuth(req)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse parameters with defaults
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const days = typeof body.days === "number" ? body.days : 7;
    const minCount = typeof body.minCount === "number" ? body.minCount : 40;
    const minProviders = typeof body.minProviders === "number" ? body.minProviders : 2;

    console.log(`[auto-promote] Running with days=${days}, minCount=${minCount}, minProviders=${minProviders}`);

    // Query top x_ tags meeting criteria
    const { data: candidates, error: queryError } = await supabase.rpc("get_auto_promote_candidates", {
      p_days: days,
      p_min_count: minCount,
      p_min_providers: minProviders,
    });

    if (queryError) {
      // Fallback: direct query if RPC doesn't exist yet
      console.warn("[auto-promote] RPC failed, using fallback query:", queryError.message);
      
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data: jobs, error: jobsError } = await supabase
        .from("video_jobs")
        .select("provider, auto_routing_tags")
        .eq("status", "done")
        .not("auto_rated_at", "is", null)
        .gte("auto_rated_at", cutoff);

      if (jobsError) {
        throw new Error(`Failed to fetch jobs: ${jobsError.message}`);
      }

      // Aggregate in memory
      const tagStats = new Map<string, { count: number; providers: Set<string> }>();
      for (const job of jobs || []) {
        const tags = job.auto_routing_tags as string[] | null;
        if (!tags) continue;
        for (const tag of tags) {
          if (!tag.startsWith("x_")) continue;
          const rawTag = tag.slice(2);
          const existing = tagStats.get(rawTag) || { count: 0, providers: new Set() };
          existing.count++;
          existing.providers.add(job.provider);
          tagStats.set(rawTag, existing);
        }
      }

      // Filter and convert
      const candidatesFromMemory: PromotionCandidate[] = [];
      for (const [rawTag, stats] of tagStats.entries()) {
        if (stats.count >= minCount && stats.providers.size >= minProviders) {
          candidatesFromMemory.push({
            raw_tag: rawTag,
            n: stats.count,
            providers: stats.providers.size,
          });
        }
      }
      candidatesFromMemory.sort((a, b) => b.n - a.n);
      
      return await processAndPromote(supabase, candidatesFromMemory.slice(0, 50), days, minCount, minProviders);
    }

    return await processAndPromote(supabase, candidates || [], days, minCount, minProviders);
  } catch (err) {
    console.error("[auto-promote] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processAndPromote(
  supabase: any,
  candidates: PromotionCandidate[],
  days: number,
  minCount: number,
  minProviders: number
): Promise<Response> {
  const promoted: string[] = [];
  const skipped: Array<{ tag: string; reason: string }> = [];

  for (const candidate of candidates) {
    const normalized = normalizeRoutingTag(candidate.raw_tag);

    // Skip if too short or in blocklist
    if (!normalized || normalized.length < 2) {
      skipped.push({ tag: candidate.raw_tag, reason: "too_short" });
      continue;
    }

    if (PROMOTION_BLOCKLIST.has(normalized)) {
      skipped.push({ tag: candidate.raw_tag, reason: "blocklisted" });
      continue;
    }

    // Upsert into allowlist
    const { error: upsertError } = await supabase
      .from("routing_tag_allowlist")
      .upsert({
        tag: normalized,
        added_by: null,
        added_at: new Date().toISOString(),
        source: "auto",
        note: `freq>=${minCount}, providers>=${minProviders}, window=${days}d, count=${candidate.n}`,
      }, { onConflict: "tag" });

    if (upsertError) {
      console.error(`[auto-promote] Failed to promote ${normalized}:`, upsertError.message);
      skipped.push({ tag: normalized, reason: "upsert_failed" });
    } else {
      promoted.push(normalized);
      console.log(`[auto-promote] Promoted: ${normalized} (count=${candidate.n}, providers=${candidate.providers})`);
    }
  }

  const result = {
    considered: candidates.length,
    promoted: promoted.length,
    skipped: skipped.length,
    promotedTags: promoted,
    skippedTags: skipped,
  };

  console.log(`[auto-promote] Complete: ${promoted.length} promoted, ${skipped.length} skipped`);

  return new Response(
    JSON.stringify(result),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
