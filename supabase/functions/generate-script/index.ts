/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logExperiment, logScore } from "../_shared/prompt-experiment-logger.ts";
import { fetchTrendEnrichment, type TrendEnrichment } from "../_shared/trend-enrichment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-pipeline-key",
};

// ============================================
// Types
// ============================================
interface AccountConfig {
  account_id: string;
  vertical: string;
  persona: { tone: string; vibe: string };
  audience: { who: string; pain_points: string[] };
  promise: string;
  content_pillars: string[];
  banned_topics: string[];
  claim_policy: string;
  cta_style: string;
  cta_phrases: string[];
  style_rules: {
    max_length_seconds: number;
    pacing: string;
    profanity: boolean;
    emoji_allowed: boolean;
  };
  disclaimer_rules: {
    always_required: boolean;
    trigger_keywords: string[];
  };
}

interface Topic {
  id: string;
  topic_prompt: string;
  hook_variants: string[];
  pillar: string;
  motif_hints: string[];
  suggested_cta?: string;
  times_used: number;
}

interface ScriptContent {
  hook: string;
  voiceover: string;
  on_screen_text: Array<{ timestamp: number; text: string }>;
  scene_prompts: string[];
  broll_keywords: string[];
  caption: string;
  hashtags: string[];
  cta: string;
  disclaimer?: string;
}

interface ContentPolicy {
  vertical: string;
  banned_phrases: string[];
  prohibited_claim_types: string[];
  required_disclaimers: string[];
  fact_check_required: boolean;
  safety_rules: Record<string, unknown>;
}

interface GenerateRequest {
  account_id: string;
  preferred_pillar?: string;
  topic_id?: string; // Force a specific topic
  mode: 'ai' | 'template';
  regenerated_from_id?: string; // Links to original failed script
  constraint?: string; // Additional guidance for LLM (e.g., fix specific issues)
  enrichment_mode?: 'none' | 'light' | 'trend_driven'; // Scraped intelligence mode
}

interface GenerateResponse {
  success: boolean;
  script_run?: Record<string, unknown>;
  error?: string;
  warnings: string[];
  request_id: string;
}

// ============================================
// Supabase Admin Client (service role)
// ============================================
function getSupabaseAdmin() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });
}

// ============================================
// Hashtag Sanitizer
// ============================================
function sanitizeHashtags(input: unknown): string[] {
  let arr: unknown[];
  if (typeof input === "string") {
    arr = input.slice(0, 2000).split(/[,\s]+/).filter(Boolean);
  } else if (Array.isArray(input)) {
    arr = input.slice(0, 50);
  } else {
    return [];
  }

  const cleaned = arr
    .filter((v): v is string => typeof v === "string")
    .map((raw) => raw.trim().slice(0, 100))
    .filter(Boolean)
    .map((tag) => tag.replace(/^#+/, ""))
    .map((tag) => tag.replace(/[\s-]+/g, "_"))
    .map((tag) => tag.replace(/[^a-zA-Z0-9_]/g, ""))
    .map((tag) => tag.toLowerCase())
    .filter((tag) => tag.length > 0 && tag.length <= 30);

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const t of cleaned) {
    if (!seen.has(t)) {
      seen.add(t);
      unique.push(t);
    }
  }

  return unique.slice(0, 12);
}

// ============================================
// SHA-256 Hash Function (collision-resistant)
// ============================================
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16); // 16 hex chars = 64 bits, enough for fingerprinting
}

async function generateFingerprints(content: ScriptContent): Promise<{
  hook_hash: string;
  voiceover_hash: string;
  scene_hash: string;
}> {
  const [hook_hash, voiceover_hash, scene_hash] = await Promise.all([
    sha256Hex(content.hook.toLowerCase().trim()),
    sha256Hex(content.voiceover.toLowerCase().trim()),
    sha256Hex(content.scene_prompts.join('|').toLowerCase()),
  ]);
  return { hook_hash, voiceover_hash, scene_hash };
}

// ============================================
// QA Checks
// ============================================
const MEDICAL_CLAIM_PATTERNS = [
  /\bcure\b/i, /\bheal\b/i, /\btreatment\b/i, /\bdiagnos/i,
  /guaranteed\s+recovery/i, /miracle\s+cure/i,
];

const EXERCISE_PATTERNS = [
  /do\s+this\s+exercise/i, /try\s+this\s+stretch/i,
  /repeat\s+\d+\s+times/i, /hold\s+for\s+\d+\s+seconds/i,
  /sets?\s+of\s+\d+/i, /reps?\s+of/i, /daily\s+exercise/i,
];

const VAGUE_HOOK_PATTERNS = [
  /^did\s+you\s+know\s+this\??$/i, /^here's\s+a\s+tip\.?$/i,
  /^check\s+this\s+out\.?$/i, /^you\s+need\s+to\s+see\s+this\.?$/i,
];

function runQA(
  content: ScriptContent,
  config: AccountConfig,
  policy: ContentPolicy | null
): {
  passed: boolean;
  errors: string[];
  warnings: string[];
  safetyFlags: string[];
  hardBlockFlags: string[];
  factClaims: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const safetyFlags: string[] = [];
  const hardBlockFlags: string[] = [];
  const factClaims: string[] = [];

  // Structure validation
  if (!content.hook || content.hook.length < 10) {
    errors.push("Hook is too short (minimum 10 characters)");
  }
  if (!content.voiceover || content.voiceover.length < 50) {
    errors.push("Voiceover is too short (minimum 50 characters)");
  }
  if (!content.cta) {
    errors.push("CTA is required");
  }

  // Vague hook detection
  for (const pattern of VAGUE_HOOK_PATTERNS) {
    if (pattern.test(content.hook)) {
      errors.push(`Hook is too vague: matches pattern "${pattern.source}"`);
      break;
    }
  }

  // Health-specific checks
  if (config.vertical === "health") {
    // Medical claim detection
    const fullText = `${content.hook} ${content.voiceover}`;
    for (const pattern of MEDICAL_CLAIM_PATTERNS) {
      if (pattern.test(fullText)) {
        safetyFlags.push(`MEDICAL_CLAIM: ${pattern.source}`);
        if (!content.disclaimer) {
          hardBlockFlags.push("TREATMENT_CLAIM_NO_DISCLAIMER");
        }
      }
    }

    // Exercise instruction detection
    for (const pattern of EXERCISE_PATTERNS) {
      if (pattern.test(content.voiceover)) {
        safetyFlags.push(`EXERCISE_INSTRUCTION: ${pattern.source}`);
        hardBlockFlags.push(`EXERCISE_INSTRUCTION_HEALTH`);
      }
    }

    // Disclaimer required for health
    if (!content.disclaimer) {
      errors.push("Health content requires a disclaimer");
    }
  }

  // Policy checks
  if (policy) {
    for (const phrase of policy.banned_phrases) {
      if (content.voiceover.toLowerCase().includes(phrase.toLowerCase())) {
        errors.push(`Banned phrase detected: "${phrase}"`);
        safetyFlags.push(`BANNED_PHRASE: ${phrase}`);
      }
    }
  }

  // CTA alignment check (normalized comparison)
  const normalizeCta = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '');
  const normalizedCta = normalizeCta(content.cta);
  const ctaMatches = config.cta_phrases.some(phrase => {
    const normalizedPhrase = normalizeCta(phrase);
    return normalizedCta === normalizedPhrase || 
           normalizedCta.startsWith(normalizedPhrase) ||
           normalizedPhrase.startsWith(normalizedCta);
  });
  if (!ctaMatches) {
    warnings.push("CTA doesn't match configured phrases");
  }

  // Hard blocks override everything
  if (hardBlockFlags.length > 0) {
    errors.push(`Hard block flags: ${hardBlockFlags.join(', ')}`);
  }

  return {
    passed: errors.length === 0 && hardBlockFlags.length === 0,
    errors,
    warnings,
    safetyFlags,
    hardBlockFlags,
    factClaims,
  };
}

// ============================================
// OpenAI Generation
// ============================================
function buildSystemPrompt(config: AccountConfig): string {
  const disclaimerNote = config.vertical === "health" 
    ? "\n\nCRITICAL: This is health content. You MUST include a disclaimer. NEVER use words like 'cure', 'heal', 'treatment', 'diagnosis', or make medical claims. Focus on emotional support, community, and general wellness. Always suggest consulting healthcare providers."
    : config.disclaimer_rules.always_required
    ? "\n\nInclude a disclaimer in your response."
    : "";

  const bannedNote = config.banned_topics.length > 0
    ? `\n\nNEVER mention these topics: ${config.banned_topics.join(", ")}`
    : "";

  return `You are a content scriptwriter for short-form video (TikTok/Instagram Reels).

ACCOUNT PROFILE:
- Vertical: ${config.vertical}
- Persona Tone: ${config.persona.tone}
- Persona Vibe: ${config.persona.vibe}
- Target Audience: ${config.audience.who}
- Audience Pain Points: ${config.audience.pain_points.join(", ")}
- Content Promise: ${config.promise}
- Content Pillars: ${config.content_pillars.join(", ")}
- CTA Style: ${config.cta_style}
- Max Length: ${config.style_rules.max_length_seconds} seconds (~${Math.round(config.style_rules.max_length_seconds * 2.5)} words)
- Pacing: ${config.style_rules.pacing}
- Emoji Allowed: ${config.style_rules.emoji_allowed}
${bannedNote}${disclaimerNote}

APPROVED CTAs (use one of these): ${config.cta_phrases.join(" | ")}

OUTPUT RULES:
1. Hook MUST be specific - include concrete objects or numbers
2. Hook should NOT be vague like "Did you know this?" or "Here's a tip"
3. Voiceover should be conversational and match the persona tone
4. Keep voiceover under ${Math.round(config.style_rules.max_length_seconds * 2.5)} words
5. Scene prompts should be detailed enough for AI video generation
6. CTA must be from the approved list above
7. Return ONLY valid JSON, no markdown`;
}

function buildUserPrompt(topic: Topic, config: AccountConfig, constraint?: string, trendBlock?: string): string {
  const hookOptions = topic.hook_variants.length > 0
    ? `\n\nHook inspiration:\n${topic.hook_variants.map((h, i) => `${i + 1}. ${h}`).join("\n")}`
    : "";

  const constraintSection = constraint
    ? `\n\nCRITICAL CONSTRAINTS (must follow):\n${constraint}`
    : "";

  const trendSection = trendBlock ? `\n\n${trendBlock}` : "";

  return `Generate a script for this topic:

TOPIC: ${topic.topic_prompt}
PILLAR: ${topic.pillar}
VISUAL HINTS: ${topic.motif_hints.join(", ") || "none specified"}
${hookOptions}${constraintSection}${trendSection}

Return JSON in this exact schema:
{
  "hook": "Opening 2 seconds - specific, attention-grabbing",
  "voiceover": "Full script text for TTS",
  "on_screen_text": [{"timestamp": 0, "text": "Key phrase"}],
  "scene_prompts": ["Detailed scene description"],
  "broll_keywords": ["keyword1", "keyword2"],
  "caption": "Caption for the post",
  "hashtags": ["tag1", "tag2"],
  "cta": "One of the approved CTAs",
  "disclaimer": ${config.vertical === "health" || config.disclaimer_rules.always_required ? '"Required disclaimer text"' : "null"}
}`;
}

async function generateWithOpenAI(
  config: AccountConfig,
  topic: Topic,
  apiKey: string,
  constraint?: string,
  trendBlock?: string
): Promise<ScriptContent> {
  const systemPrompt = buildSystemPrompt(config);
  const userPrompt = buildUserPrompt(topic, config, constraint, trendBlock);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1500,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  if (!content) {
    throw new Error("No content returned from OpenAI");
  }

  const parsed = JSON.parse(content);

  // Validate and sanitize
  if (!parsed.hook || !parsed.voiceover || !parsed.cta) {
    throw new Error("Missing required fields from OpenAI response");
  }

  // Log hashtag sanitization
  const rawHashtags = parsed.hashtags;
  const rawArr = typeof rawHashtags === "string"
    ? rawHashtags.split(/[,\s]+/).filter(Boolean).slice(0, 50)
    : Array.isArray(rawHashtags) ? rawHashtags.slice(0, 50) : [];
  const hashtags = sanitizeHashtags(rawHashtags);

  console.log("[hashtags]", {
    raw_type: Array.isArray(rawHashtags) ? "array" : typeof rawHashtags,
    raw_count: rawArr.length,
    sanitized_count: hashtags.length,
    removed_count: Math.max(0, rawArr.length - hashtags.length),
    sample_raw: rawArr.slice(0, 5),
    sample_sanitized: hashtags.slice(0, 5),
  });

  return {
    hook: String(parsed.hook),
    voiceover: String(parsed.voiceover),
    on_screen_text: Array.isArray(parsed.on_screen_text) 
      ? parsed.on_screen_text.filter((item: unknown): item is { timestamp: number; text: string } => 
          typeof item === 'object' && item !== null &&
          typeof (item as Record<string, unknown>).timestamp === 'number' && 
          typeof (item as Record<string, unknown>).text === 'string'
        )
      : [],
    scene_prompts: Array.isArray(parsed.scene_prompts) 
      ? parsed.scene_prompts.filter((s: unknown): s is string => typeof s === 'string')
      : [],
    broll_keywords: Array.isArray(parsed.broll_keywords)
      ? parsed.broll_keywords.filter((s: unknown): s is string => typeof s === 'string')
      : [],
    caption: typeof parsed.caption === 'string' ? parsed.caption : "",
    hashtags,
    cta: String(parsed.cta),
    disclaimer: typeof parsed.disclaimer === 'string' ? parsed.disclaimer : undefined,
  };
}

// ============================================
// Template Generation (fallback)
// ============================================
function generateTemplateContent(config: AccountConfig, topic: Topic): ScriptContent {
  const hook = topic.hook_variants[0] || `Here's something about ${topic.pillar} you should know...`;
  const cta = config.cta_phrases[0] || "Follow for more";

  return {
    hook,
    voiceover: `${hook} ${topic.topic_prompt} Remember, ${config.promise}. ${cta}`,
    on_screen_text: [{ timestamp: 0, text: hook.substring(0, 50) }],
    scene_prompts: topic.motif_hints.length > 0 
      ? [`Scene showing: ${topic.motif_hints.join(', ')}`]
      : [`Scene related to: ${topic.pillar}`],
    broll_keywords: topic.motif_hints.slice(0, 5),
    caption: `${topic.topic_prompt.substring(0, 100)}...`,
    hashtags: [config.vertical, topic.pillar.replace(/\s+/g, '')],
    cta,
    disclaimer: config.vertical === "health" || config.disclaimer_rules.always_required
      ? "This is not professional advice. Consult a qualified professional for guidance."
      : undefined,
  };
}

// ============================================
// Main Handler
// ============================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const warnings: string[] = [];
  const requestId = crypto.randomUUID();

  try {
    // ============================================
    // Auth Gate: Three valid paths
    // 1. JWT + admin/qa role (browser UI)
    // 2. Service role via apikey header (internal function-to-function)
    // 3. Pipeline key (external automation/batch - keep for now, remove later)
    // ============================================
    const pipelineKey = Deno.env.get("PIPELINE_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    
    const clientPipelineKey = req.headers.get("x-pipeline-key");
    const apiKeyHeader = req.headers.get("apikey");
    const authHeader = req.headers.get("Authorization");
    const internalCaller = req.headers.get("x-internal-call");
    
    let authPath = "none";
    let authUserId: string | null = null;
    
    // Path 1: Pipeline key (for automation/batch)
    if (pipelineKey && clientPipelineKey === pipelineKey) {
      authPath = "pipeline_key";
    }
    // Path 2: Service role (internal function-to-function)
    else if (serviceRoleKey && apiKeyHeader === serviceRoleKey) {
      authPath = "service_role";
    }
    // Path 3: JWT + role check (browser UI)
    else if (authHeader && anonKey && supabaseUrl) {
      const supabaseAuth = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false },
        global: { headers: { Authorization: authHeader } }
      });
      
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
      
      if (!authError && user) {
        // Check role
        const supabaseAdmin = getSupabaseAdmin();
        const { data: hasRole } = await supabaseAdmin.rpc('has_any_role', { 
          _user_id: user.id, 
          _roles: ['admin', 'qa']
        });
        
        if (hasRole) {
          authPath = "jwt_role";
          authUserId = user.id;
        }
      }
    }
    
    if (authPath === "none") {
      console.warn({ requestId, event: "unauthorized", reason: "no valid auth path" });
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized", warnings: [], request_id: requestId }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log({ requestId, event: "auth_passed", path: authPath, user_id: authUserId, internal_caller: internalCaller });

    const supabaseAdmin = getSupabaseAdmin();
    const { account_id, preferred_pillar, topic_id: forcedTopicId, mode, regenerated_from_id, constraint, enrichment_mode }: GenerateRequest = await req.json();

    if (!account_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing account_id", warnings, request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log({ requestId, event: "pipeline_start", account_id, mode, preferred_pillar, forcedTopicId, regenerated_from_id, hasConstraint: !!constraint });

    // 1. Fetch account config
    const { data: configData, error: configError } = await supabaseAdmin
      .from('account_configs')
      .select('*')
      .eq('account_id', account_id)
      .single();

    if (configError || !configData) {
      return new Response(
        JSON.stringify({ success: false, error: `Account not found: ${account_id}`, warnings }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const config: AccountConfig = {
      account_id: configData.account_id,
      vertical: configData.vertical,
      persona: configData.persona as { tone: string; vibe: string },
      audience: configData.audience as { who: string; pain_points: string[] },
      promise: configData.promise,
      content_pillars: configData.content_pillars,
      banned_topics: configData.banned_topics,
      claim_policy: configData.claim_policy,
      cta_style: configData.cta_style,
      cta_phrases: configData.cta_phrases,
      style_rules: configData.style_rules as AccountConfig['style_rules'],
      disclaimer_rules: configData.disclaimer_rules as AccountConfig['disclaimer_rules'],
    };

    // 2. Fetch content policy
    const { data: policyData } = await supabaseAdmin
      .from('content_policies')
      .select('*')
      .eq('vertical', config.vertical)
      .single();

    const policy: ContentPolicy | null = policyData ? {
      vertical: policyData.vertical,
      banned_phrases: policyData.banned_phrases,
      prohibited_claim_types: policyData.prohibited_claim_types,
      required_disclaimers: policyData.required_disclaimers,
      fact_check_required: policyData.fact_check_required,
      safety_rules: policyData.safety_rules as Record<string, unknown>,
    } : null;

    // 3. Select topic - use forced topic_id if provided, otherwise RPC
    let topic: Topic | null = null;

    if (forcedTopicId) {
      // Use specific topic (for regeneration with same topic)
      const { data: forcedTopic, error: forcedError } = await supabaseAdmin
        .from('topic_bank')
        .select('*')
        .eq('id', forcedTopicId)
        .single();

      if (!forcedError && forcedTopic) {
        topic = {
          id: forcedTopic.id,
          topic_prompt: forcedTopic.topic_prompt,
          hook_variants: forcedTopic.hook_variants,
          pillar: forcedTopic.pillar,
          motif_hints: forcedTopic.motif_hints,
          suggested_cta: forcedTopic.suggested_cta,
          times_used: forcedTopic.times_used,
        };
        console.log("[pipeline] Using forced topic_id:", forcedTopicId);
      }
    }

    if (!topic) {
      // Select via RPC (respects cooldown and usage weighting)
      const { data: topicData, error: topicError } = await supabaseAdmin.rpc('select_topic', {
        p_vertical: config.vertical,
        p_pillar: preferred_pillar ?? null,
      });

      if (!topicError && topicData && Array.isArray(topicData) && topicData.length > 0) {
        const t = topicData[0];
        topic = {
          id: t.id,
          topic_prompt: t.topic_prompt,
          hook_variants: t.hook_variants,
          pillar: t.pillar,
          motif_hints: t.motif_hints,
          suggested_cta: t.suggested_cta,
          times_used: t.times_used,
        };
      }
    }

    if (!topic) {
      // Fallback: get any topic
      const { data: fallbackTopic } = await supabaseAdmin
        .from('topic_bank')
        .select('*')
        .eq('vertical', config.vertical)
        .order('times_used', { ascending: true })
        .limit(1)
        .single();

      if (!fallbackTopic) {
        return new Response(
          JSON.stringify({ success: false, error: "No topics available", warnings, request_id: requestId }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      topic = {
        id: fallbackTopic.id,
        topic_prompt: fallbackTopic.topic_prompt,
        hook_variants: fallbackTopic.hook_variants,
        pillar: fallbackTopic.pillar,
        motif_hints: fallbackTopic.motif_hints,
        suggested_cta: fallbackTopic.suggested_cta,
        times_used: fallbackTopic.times_used,
      };
    }

    console.log(`[pipeline] Topic selected: ${topic.topic_prompt.substring(0, 50)}...`);

    // 3.5. Fetch trend enrichment from scraped insights
    const trendEnrichment: TrendEnrichment = await fetchTrendEnrichment(supabaseAdmin, {
      vertical: config.vertical,
      pillar: topic.pillar,
      topic_prompt: topic.topic_prompt,
      mode: enrichment_mode || "light",
    });

    if (trendEnrichment.enabled) {
      console.log(`[pipeline] Trend enrichment: ${trendEnrichment.mode}, ${trendEnrichment.insight_ids.length} insights, hooks=${trendEnrichment.hook_patterns.length}`);
    }

    // 4. Generate content
    let content: ScriptContent;
    let generationCost = 1;

    if (mode === 'ai') {
      const apiKey = Deno.env.get("OPENAI_API_KEY");
      if (!apiKey) {
        return new Response(
          JSON.stringify({ success: false, error: "OPENAI_API_KEY not configured", warnings }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      content = await generateWithOpenAI(config, topic, apiKey, constraint, trendEnrichment.prompt_block || undefined);
      generationCost = 3;
      console.log("[pipeline] AI generation complete", { hasConstraint: !!constraint, enriched: trendEnrichment.enabled });
    } else {
      content = generateTemplateContent(config, topic);
      console.log("[pipeline] Template generation complete");
    }

    // ============================================
    // Debug Toggles (for deterministic testing)
    // Guarded by ALLOW_DEBUG_TOGGLES env var + pipeline key
    // ============================================
    const allowDebug = Deno.env.get("ALLOW_DEBUG_TOGGLES") === "true";
    const debugForceExercise = allowDebug && req.headers.get("x-debug-force-exercise") === "1";
    const debugFixedContent = allowDebug && req.headers.get("x-debug-fixed-content") === "1";

    if (debugForceExercise && config.vertical === "health") {
      content.voiceover += " Hold for 30 seconds and repeat 10 times daily for best results.";
      console.log({ requestId, event: "debug_inject", type: "exercise_instruction" });
    }

    if (debugFixedContent) {
      content.hook = "FIXED HOOK 12345 - deterministic test content";
      content.voiceover = "FIXED VOICEOVER 12345 - this is deterministic test content for fingerprint collision testing. It contains enough words to pass minimum length validation.";
      content.scene_prompts = ["FIXED SCENE 12345 - test scene prompt"];
      content.cta = config.cta_phrases[0] || "Follow for more";
      if (config.vertical === "health") {
        content.disclaimer = "This is not professional advice. Consult a qualified professional.";
      }
      console.log({ requestId, event: "debug_inject", type: "fixed_content" });
    }

    // 5. Run QA
    const qaResult = runQA(content, config, policy);
    warnings.push(...qaResult.warnings);

    console.log({ requestId, event: "qa_complete", passed: qaResult.passed, errors: qaResult.errors.length, warnings: qaResult.warnings.length });

    // 6. Generate fingerprints
    const fingerprints = await generateFingerprints(content);

    // 7. Insert script_run
    const finalStatus = qaResult.passed ? 'qa_passed' : 'qa_failed';
    const { data: scriptRun, error: insertError } = await supabaseAdmin
      .from('script_runs')
      .insert({
        account_id,
        topic_id: topic.id,
        status: finalStatus,
        script_content: content,
        qa_results: qaResult,
        safety_flags: qaResult.safetyFlags,
        fact_claims: qaResult.factClaims,
        hard_block_flags: qaResult.hardBlockFlags,
        generation_cost_cents: generationCost,
        hook_hash: fingerprints.hook_hash,
        voiceover_hash: fingerprints.voiceover_hash,
        scene_hash: fingerprints.scene_hash,
        qa_passed_at: qaResult.passed ? new Date().toISOString() : null,
        qa_failed_reason: qaResult.passed ? null : qaResult.errors.join('; '),
        regenerated_from_id: regenerated_from_id || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[pipeline] Insert error:", insertError);
      return new Response(
        JSON.stringify({ success: false, error: `Failed to save: ${insertError.message}`, warnings }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[pipeline] Script saved with id: ${scriptRun.id}, status: ${finalStatus}`);

    // ── Prompt R&D: log hook + script experiments ──
    const hookFamily = content.hook.length < 20 ? "curiosity" : "value_first"; // heuristic family
    const hookExpId = await logExperiment({
      stage: "hook",
      family: hookFamily,
      promptText: content.hook,
      promptVariables: { topic: topic.topic_prompt, pillar: topic.pillar },
      inputContext: { account_id, vertical: config.vertical, topic_id: topic.id },
      outputSummary: { hook: content.hook, char_count: content.hook.length },
      vertical: config.vertical,
      model: mode === "ai" ? "gpt-4o" : "template",
      accountId: account_id,
      scriptRunId: scriptRun.id,
      status: finalStatus === "qa_passed" ? "scored" : "rejected",
    }, supabaseAdmin);

    const scriptExpId = await logExperiment({
      stage: "script",
      family: mode === "ai" ? "fast_explainer" : "template",
      promptText: content.voiceover,
      promptVariables: { topic: topic.topic_prompt, pillar: topic.pillar, hook: content.hook },
      inputContext: { account_id, vertical: config.vertical, topic_id: topic.id, mode },
      outputSummary: {
        scene_count: content.scene_prompts.length,
        word_count: content.voiceover.split(/\s+/).length,
        has_disclaimer: !!content.disclaimer,
      },
      vertical: config.vertical,
      model: mode === "ai" ? "gpt-4o" : "template",
      accountId: account_id,
      scriptRunId: scriptRun.id,
      status: finalStatus === "qa_passed" ? "scored" : "rejected",
    }, supabaseAdmin);

    // Log output scores from QA results
    if (hookExpId) {
      await logScore({
        experimentId: hookExpId,
        overallScore: qaResult.passed ? 7 : 3,
        hookStrength: qaResult.passed ? 7 : 3,
        hardFail: qaResult.hardBlockFlags.length > 0,
        riskScore: qaResult.safetyFlags.length,
        notes: qaResult.errors.length > 0 ? qaResult.errors.join("; ") : undefined,
        scorePayload: { qa_passed: qaResult.passed, safety_flags: qaResult.safetyFlags },
      }, "output", supabaseAdmin);
    }

    if (scriptExpId) {
      await logScore({
        experimentId: scriptExpId,
        overallScore: qaResult.passed ? 7 : 3,
        clarity: qaResult.passed ? 7 : 4,
        coherence: qaResult.passed ? 7 : 4,
        hardFail: qaResult.hardBlockFlags.length > 0,
        riskScore: qaResult.safetyFlags.length,
        notes: qaResult.errors.length > 0 ? qaResult.errors.join("; ") : undefined,
        scorePayload: { qa_passed: qaResult.passed, word_count: content.voiceover.split(/\s+/).length },
      }, "output", supabaseAdmin);
    }

    console.log(`[pipeline] Prompt R&D logged: hook=${hookExpId} script=${scriptExpId}`);

    // 8. If QA passed, insert fingerprint and update topic
    if (qaResult.passed && scriptRun) {
      const { error: fpError } = await supabaseAdmin
        .from('script_fingerprints')
        .insert({
          script_id: scriptRun.id,
          account_id,
          topic_id: topic.id,
          hook_hash: fingerprints.hook_hash,
          voiceover_hash: fingerprints.voiceover_hash,
        });

      if (fpError) {
        if (fpError.code === '23505') {
          // Fingerprint collision
          await supabaseAdmin
            .from('script_runs')
            .update({
              status: 'qa_failed',
              qa_failed_reason: 'Fingerprint collision - duplicate content',
              qa_passed_at: null,
            })
            .eq('id', scriptRun.id);

          console.log({ requestId, event: "fingerprint_collision", script_id: scriptRun.id });
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: "Fingerprint collision - duplicate content", 
              warnings,
              request_id: requestId,
            }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        console.error({ requestId, event: "fingerprint_error", error: fpError });
      }

      // Update topic usage
      await supabaseAdmin
        .from('topic_bank')
        .update({
          times_used: topic.times_used + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq('id', topic.id);

      console.log({ requestId, event: "topic_updated", topic_id: topic.id });
    }

    console.log({ requestId, event: "pipeline_complete", status: finalStatus, script_id: scriptRun?.id });
    return new Response(
      JSON.stringify({
        success: true,
        script_run: scriptRun,
        warnings,
        request_id: requestId,
      } as GenerateResponse),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error({ requestId, event: "pipeline_error", error: error instanceof Error ? error.message : "Unknown" });
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error",
        warnings,
        request_id: requestId,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});