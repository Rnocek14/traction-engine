// ============================================
// Script Runs - DB-Native Operations
// ============================================
import { supabase } from "@/integrations/supabase/client";
import type { 
  ScriptContent, 
  QAResult,
  ContentVertical
} from "@/types/script-types";
import { 
  generateScriptFingerprints, 
  validateScriptContent 
} from "@/types/script-types";
import { 
  runScriptQA, 
  extractFactClaims, 
  detectSafetyFlags 
} from "@/lib/content-qa";
import { 
  checkHookQuality, 
  checkCtaAlignment,
  detectExerciseInstructions 
} from "@/lib/quality-checks";
import { generateScriptWithAI } from "@/lib/openai-client";
import type { Tables, Enums } from "@/integrations/supabase/types";

// ============================================
// Types - Use DB types for operations
// ============================================
export type DbAccountConfig = Tables<'account_configs'>;
export type DbContentPolicy = Tables<'content_policies'>;
export type DbTopic = Tables<'topic_bank'>;
export type DbScriptRun = Tables<'script_runs'>;

export interface CreateScriptOptions {
  accountId: string;
  preferredPillar?: string;
  mode: 'ai' | 'template';
}

export interface ScriptRunResult {
  success: boolean;
  scriptRun?: DbScriptRun;
  error?: string;
  warnings: string[];
}

interface RecentFingerprint {
  hook_hash: string;
  voiceover_hash: string;
  account_id: string;
  created_at: string;
}

// Mapped types for passing to existing QA functions
interface MappedAccountConfig {
  account_id: string;
  vertical: ContentVertical;
  persona: { tone: string; vibe: string };
  audience: { who: string; pain_points: string[] };
  promise: string;
  content_pillars: string[];
  banned_topics: string[];
  claim_policy: Enums<'claim_policy_level'>;
  cta_style: Enums<'cta_style'>;
  cta_destination?: string | null;
  cta_phrases: string[];
  style_rules: { max_length_seconds: number; pacing: string; profanity: boolean; emoji_allowed: boolean };
  disclaimer_rules: { always_required: boolean; trigger_keywords: string[] };
  uniqueness_salt?: string | null;
}

interface MappedContentPolicy {
  vertical: ContentVertical;
  banned_phrases: string[];
  prohibited_claim_types: string[];
  required_disclaimers: string[];
  fact_check_required: boolean;
  safety_rules: Record<string, unknown>;
}

interface MappedTopic {
  id: string;
  vertical: ContentVertical;
  pillar: string;
  topic_prompt: string;
  hook_variants: string[];
  suggested_cta?: string | null;
  motif_hints: string[];
  claim_sensitivity: number;
  cooldown_days: number;
  times_used: number;
  seasonal_tags: string[];
  trend_keywords: string[];
  is_evergreen: boolean;
}

// ============================================
// Mappers - Convert DB types to local types
// ============================================
function mapDbAccountConfig(data: DbAccountConfig): MappedAccountConfig {
  const persona = data.persona as Record<string, unknown>;
  const audience = data.audience as Record<string, unknown>;
  const style_rules = data.style_rules as Record<string, unknown>;
  const disclaimer_rules = data.disclaimer_rules as Record<string, unknown>;

  return {
    account_id: data.account_id,
    vertical: data.vertical as ContentVertical,
    persona: {
      tone: String(persona?.tone || 'informative'),
      vibe: String(persona?.vibe || 'friendly'),
    },
    audience: {
      who: String(audience?.who || ''),
      pain_points: Array.isArray(audience?.pain_points) ? audience.pain_points.map(String) : [],
    },
    promise: data.promise,
    content_pillars: data.content_pillars,
    banned_topics: data.banned_topics,
    claim_policy: data.claim_policy,
    cta_style: data.cta_style,
    cta_destination: data.cta_destination,
    cta_phrases: data.cta_phrases,
    style_rules: {
      max_length_seconds: Number(style_rules?.max_length_seconds || 60),
      pacing: String(style_rules?.pacing || 'medium'),
      profanity: Boolean(style_rules?.profanity),
      emoji_allowed: Boolean(style_rules?.emoji_allowed ?? true),
    },
    disclaimer_rules: {
      always_required: Boolean(disclaimer_rules?.always_required),
      trigger_keywords: Array.isArray(disclaimer_rules?.trigger_keywords) 
        ? disclaimer_rules.trigger_keywords.map(String) 
        : [],
    },
    uniqueness_salt: data.uniqueness_salt,
  };
}

function mapDbContentPolicy(data: DbContentPolicy): MappedContentPolicy {
  return {
    vertical: data.vertical as ContentVertical,
    banned_phrases: data.banned_phrases,
    prohibited_claim_types: data.prohibited_claim_types,
    required_disclaimers: data.required_disclaimers,
    fact_check_required: data.fact_check_required,
    safety_rules: data.safety_rules as Record<string, unknown>,
  };
}

function mapDbTopic(data: DbTopic): MappedTopic {
  return {
    id: data.id,
    vertical: data.vertical as ContentVertical,
    pillar: data.pillar,
    topic_prompt: data.topic_prompt,
    hook_variants: data.hook_variants,
    suggested_cta: data.suggested_cta,
    motif_hints: data.motif_hints,
    claim_sensitivity: data.claim_sensitivity,
    cooldown_days: data.cooldown_days,
    times_used: data.times_used,
    seasonal_tags: data.seasonal_tags,
    trend_keywords: data.trend_keywords,
    is_evergreen: data.is_evergreen,
  };
}

// ============================================
// Fetch Account Config from DB
// ============================================
export async function fetchAccountConfig(accountId: string): Promise<MappedAccountConfig | null> {
  const { data, error } = await supabase
    .from('account_configs')
    .select('*')
    .eq('account_id', accountId)
    .single();

  if (error || !data) {
    console.error('Failed to fetch account config:', error);
    return null;
  }

  return mapDbAccountConfig(data);
}

// ============================================
// Fetch Content Policy from DB
// ============================================
export async function fetchContentPolicy(vertical: ContentVertical): Promise<MappedContentPolicy | null> {
  const { data, error } = await supabase
    .from('content_policies')
    .select('*')
    .eq('vertical', vertical)
    .single();

  if (error || !data) {
    console.error('Failed to fetch content policy:', error);
    return null;
  }

  return mapDbContentPolicy(data);
}

// ============================================
// Select Topic from DB (with cooldown)
// ============================================
export async function selectTopicFromDB(
  vertical: ContentVertical,
  preferredPillar?: string
): Promise<MappedTopic | null> {
  // Use the select_topic RPC function for proper cooldown filtering
  const { data, error } = await supabase.rpc('select_topic', {
    p_vertical: vertical,
    p_pillar: preferredPillar ?? null,
  });

  if (error) {
    console.error('Failed to select topic via RPC:', error);
    
    // Fallback: direct query (less accurate cooldown)
    const { data: fallbackData } = await supabase
      .from('topic_bank')
      .select('*')
      .eq('vertical', vertical)
      .order('times_used', { ascending: true })
      .limit(1)
      .single();

    if (!fallbackData) return null;
    return mapDbTopic(fallbackData);
  }

  // RPC returns an array, get first item
  const topic = Array.isArray(data) ? data[0] : data;
  if (!topic) {
    // No topics available after cooldown filtering, try without cooldown
    const { data: anyTopic } = await supabase
      .from('topic_bank')
      .select('*')
      .eq('vertical', vertical)
      .order('times_used', { ascending: true })
      .limit(1)
      .single();

    if (!anyTopic) return null;
    return mapDbTopic(anyTopic);
  }

  return mapDbTopic(topic as DbTopic);
}

// ============================================
// Fetch Recent Fingerprints from DB
// ============================================
export async function fetchRecentFingerprints(
  accountId: string,
  days: number = 30
): Promise<RecentFingerprint[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const { data, error } = await supabase
    .from('script_fingerprints')
    .select('hook_hash, voiceover_hash, account_id, created_at')
    .eq('account_id', accountId)
    .gte('created_at', cutoffDate.toISOString())
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Failed to fetch fingerprints:', error);
    return [];
  }

  return data || [];
}

// ============================================
// Run QA Gate with Exercise Detection
// ============================================
interface QAGateResult {
  passed: boolean;
  qaResult: QAResult;
  safetyFlags: string[];
  hardBlockFlags: string[];
  factClaims: string[];
  fingerprints: {
    hook_hash: string;
    voiceover_hash: string;
    scene_hash: string;
  };
  qualityWarnings: string[];
}

function runQAGateWithHardBlocks(
  content: ScriptContent,
  config: MappedAccountConfig,
  policy: MappedContentPolicy | null,
  recentFingerprints: RecentFingerprint[] = []
): QAGateResult {
  // Prepare config in format expected by QA functions
  // Cast the mapped config to the expected AccountConfig shape
  const qaConfig = {
    ...config,
    id: '', // Not needed for QA
    created_at: '',
    updated_at: '',
  } as Parameters<typeof runScriptQA>[1];

  const qaPolicy = policy ? {
    ...policy,
    id: '',
    created_at: '',
    updated_at: '',
  } as Parameters<typeof runScriptQA>[2] : null;

  // Run base QA checks
  const qaResult = runScriptQA(content, qaConfig, qaPolicy, {
    recentFingerprints,
    skipUniqueness: recentFingerprints.length === 0,
  });

  // Build extra errors array to avoid mutation issues
  const extraErrors: string[] = [];

  // Extract fact claims
  const factClaims = extractFactClaims(content);

  // Detect safety flags
  const safetyFlags = detectSafetyFlags(content, config.vertical);

  // Detect exercise instructions (for health)
  if (config.vertical === 'health') {
    const exerciseFlags = detectExerciseInstructions(content.voiceover);
    safetyFlags.push(...exerciseFlags);
  }

  // Generate fingerprints
  const fingerprints = generateScriptFingerprints(content);

  // Quality checks
  const qualityWarnings: string[] = [];

  // Hook quality check
  const hookCheck = checkHookQuality(content.hook);
  if (!hookCheck.passed) {
    extraErrors.push(...hookCheck.errors);
  }
  qualityWarnings.push(...hookCheck.warnings);

  // CTA alignment check
  const ctaCheck = checkCtaAlignment(content.cta, qaConfig);
  if (!ctaCheck.passed) {
    extraErrors.push(...ctaCheck.errors);
  }
  qualityWarnings.push(...ctaCheck.warnings);

  // Determine hard block flags (critical safety issues)
  const hardBlockFlags: string[] = [];
  const criticalFlags = [
    "MEDICAL_CURE_CLAIM",
    "TREATMENT_CLAIM_NO_DISCLAIMER",
    "POTENTIALLY_ILLEGAL_CONTENT",
  ];

  for (const flag of safetyFlags) {
    if (criticalFlags.includes(flag)) {
      hardBlockFlags.push(flag);
    }
    // Exercise instructions are hard blocks for health
    if (flag.startsWith('EXERCISE_INSTRUCTION') && config.vertical === 'health') {
      hardBlockFlags.push(flag);
    }
  }

  // Build final QA result
  const finalQaResult: QAResult = {
    passed: qaResult.passed && extraErrors.length === 0 && hardBlockFlags.length === 0,
    checks: {
      ...qaResult.checks,
      structure_valid: qaResult.checks.structure_valid && hookCheck.passed,
    },
    errors: [...qaResult.errors, ...extraErrors],
    warnings: [...qaResult.warnings, ...qualityWarnings],
  };

  if (hardBlockFlags.length > 0) {
    finalQaResult.passed = false;
    finalQaResult.errors.push(`Hard block flags detected: ${hardBlockFlags.join(', ')}`);
  }

  return {
    passed: finalQaResult.passed,
    qaResult: finalQaResult,
    safetyFlags,
    hardBlockFlags,
    factClaims,
    fingerprints,
    qualityWarnings,
  };
}

// ============================================
// Create Script Run (DB-Native)
// ============================================
export async function createScriptRun(options: CreateScriptOptions): Promise<ScriptRunResult> {
  const warnings: string[] = [];

  // 1. Fetch account config from DB
  const config = await fetchAccountConfig(options.accountId);
  if (!config) {
    return {
      success: false,
      error: `Account config not found for ID: ${options.accountId}`,
      warnings,
    };
  }

  // 2. Fetch content policy from DB
  const policy = await fetchContentPolicy(config.vertical);

  // 3. Select topic from DB (respecting cooldown)
  const topic = await selectTopicFromDB(config.vertical, options.preferredPillar);
  if (!topic) {
    return {
      success: false,
      error: `No available topics for account ${options.accountId} (vertical: ${config.vertical})`,
      warnings,
    };
  }

  // 4. Fetch recent fingerprints from DB
  const recentFingerprints = await fetchRecentFingerprints(options.accountId);

  // 5. Generate content
  let content: ScriptContent;
  let generationCost = 1;

  if (options.mode === 'ai') {
    // Prepare topic for AI call
    const aiTopic = {
      id: topic.id,
      topic_prompt: topic.topic_prompt,
      hook_variants: topic.hook_variants,
      pillar: topic.pillar,
      motif_hints: topic.motif_hints,
      suggested_cta: topic.suggested_cta,
      vertical: topic.vertical,
      claim_sensitivity: topic.claim_sensitivity,
      cooldown_days: topic.cooldown_days,
      times_used: topic.times_used,
      seasonal_tags: topic.seasonal_tags,
      trend_keywords: topic.trend_keywords,
      is_evergreen: topic.is_evergreen,
      created_at: '',
    };

    // Prepare config for AI call
    const aiConfig = {
      ...config,
      id: '',
      created_at: '',
      updated_at: '',
    };

    // Call OpenAI via edge function
    const aiResponse = await generateScriptWithAI(
      aiConfig as Parameters<typeof generateScriptWithAI>[0],
      aiTopic as Parameters<typeof generateScriptWithAI>[1]
    );
    
    if (!aiResponse.success || !aiResponse.script_content) {
      return {
        success: false,
        error: aiResponse.error || "Failed to generate script with AI",
        warnings,
      };
    }
    
    content = aiResponse.script_content;
    generationCost = aiResponse.generation_cost_cents || 3;
  } else {
    // Template-based generation (import dynamically to avoid circular deps)
    const { generateScriptContent } = await import('@/lib/script-generator');
    
    // Prepare topic and config for template generation
    const templateConfig = {
      ...config,
      id: '',
      created_at: '',
      updated_at: '',
    };
    
    const templateTopic = {
      ...topic,
      created_at: '',
    };
    
    content = generateScriptContent(
      templateConfig as Parameters<typeof generateScriptContent>[0],
      templateTopic as Parameters<typeof generateScriptContent>[1]
    );
  }

  // 6. Validate structure
  const validation = validateScriptContent(content);
  if (!validation.valid) {
    return {
      success: false,
      error: `Content validation failed: ${validation.errors.join(', ')}`,
      warnings,
    };
  }

  // 7. Run QA Gate
  const qaGate = runQAGateWithHardBlocks(content, config, policy, recentFingerprints);
  warnings.push(...qaGate.qualityWarnings);
  warnings.push(...qaGate.qaResult.warnings);

  // 8. Insert script_run as draft first
  const { data: insertedRun, error: insertError } = await supabase
    .from('script_runs')
    .insert({
      account_id: options.accountId,
      topic_id: topic.id,
      status: 'draft' as const,
      script_content: content,
      qa_results: qaGate.qaResult,
      safety_flags: qaGate.safetyFlags,
      fact_claims: qaGate.factClaims,
      hard_block_flags: qaGate.hardBlockFlags,
      generation_cost_cents: generationCost,
      hook_hash: qaGate.fingerprints.hook_hash,
      voiceover_hash: qaGate.fingerprints.voiceover_hash,
      scene_hash: qaGate.fingerprints.scene_hash,
    } as never)
    .select()
    .single();

  if (insertError || !insertedRun) {
    console.error('Failed to insert script run:', insertError);
    return {
      success: false,
      error: `Failed to save script: ${insertError?.message}`,
      warnings,
    };
  }

  // 9. Update status based on QA result
  const finalStatus: Enums<'script_status'> = qaGate.passed ? 'qa_passed' : 'qa_failed';
  const updateData: Record<string, unknown> = {
    status: finalStatus,
  };

  if (qaGate.passed) {
    updateData.qa_passed_at = new Date().toISOString();
  } else {
    updateData.qa_failed_reason = qaGate.qaResult.errors.join('; ');
  }

  const { data: updatedRun, error: updateError } = await supabase
    .from('script_runs')
    .update(updateData)
    .eq('id', insertedRun.id)
    .select()
    .single();

  if (updateError) {
    console.error('Failed to update script status:', updateError);
  }

  // 10. If QA passed, insert fingerprints
  if (qaGate.passed) {
    const { error: fpError } = await supabase
      .from('script_fingerprints')
      .insert({
        script_id: insertedRun.id,
        account_id: options.accountId,
        topic_id: topic.id,
        hook_hash: qaGate.fingerprints.hook_hash,
        voiceover_hash: qaGate.fingerprints.voiceover_hash,
      });

    if (fpError) {
      // Check if it's a uniqueness constraint violation
      if (fpError.code === '23505') {
        // Fingerprint collision - flip status to qa_failed
        await supabase
          .from('script_runs')
          .update({
            status: 'qa_failed' as Enums<'script_status'>,
            qa_failed_reason: 'Fingerprint collision - duplicate content detected',
            qa_passed_at: null,
          })
          .eq('id', insertedRun.id);

        return {
          success: false,
          error: 'Fingerprint collision - duplicate content detected',
          warnings,
        };
      }
      console.error('Failed to insert fingerprint:', fpError);
    }

    // 11. Update topic usage
    await supabase
      .from('topic_bank')
      .update({
        times_used: topic.times_used + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', topic.id);
  }

  return {
    success: true,
    scriptRun: updatedRun || insertedRun,
    warnings,
  };
}

// ============================================
// List Script Runs from DB
// ============================================
export async function listScriptRuns(options: {
  accountId?: string;
  status?: Enums<'script_status'>;
  limit?: number;
} = {}): Promise<DbScriptRun[]> {
  let query = supabase
    .from('script_runs')
    .select('*')
    .order('created_at', { ascending: false });

  if (options.accountId) {
    query = query.eq('account_id', options.accountId);
  }

  if (options.status) {
    query = query.eq('status', options.status);
  }

  query = query.limit(options.limit || 50);

  const { data, error } = await query;

  if (error) {
    console.error('Failed to list script runs:', error);
    return [];
  }

  return data || [];
}

// ============================================
// List QA Inbox (failed scripts without overrides)
// ============================================
export async function listQaInbox(options: {
  vertical?: ContentVertical;
  search?: string;
  limit?: number;
} = {}): Promise<DbScriptRun[]> {
  let query = supabase
    .from('script_runs')
    .select('*')
    .eq('status', 'qa_failed' as Enums<'script_status'>)
    .is('qa_override_at', null)
    .order('created_at', { ascending: false });

  query = query.limit(options.limit || 50);

  const { data, error } = await query;

  if (error) {
    console.error('Failed to list QA inbox:', error);
    return [];
  }

  let results = data || [];

  // Filter by search term
  if (options.search) {
    const search = options.search.toLowerCase();
    results = results.filter(run => {
      const content = run.script_content as unknown as ScriptContent;
      return (
        content?.hook?.toLowerCase().includes(search) ||
        run.qa_failed_reason?.toLowerCase().includes(search) ||
        run.safety_flags.some(f => f.toLowerCase().includes(search))
      );
    });
  }

  return results;
}

// ============================================
// Override QA (admin action)
// ============================================
export async function overrideQa(options: {
  scriptId: string;
  overrideBy: string;
  reason: string;
}): Promise<{ success: boolean; error?: string }> {
  // First, check if hard_block_flags exist
  const { data: script, error: fetchError } = await supabase
    .from('script_runs')
    .select('hard_block_flags, status')
    .eq('id', options.scriptId)
    .single();

  if (fetchError || !script) {
    return { success: false, error: 'Script not found' };
  }

  // Server-side enforcement: no overrides if hard_block_flags present
  if (script.hard_block_flags && script.hard_block_flags.length > 0) {
    return { 
      success: false, 
      error: `Cannot override: hard block flags present (${script.hard_block_flags.join(', ')})` 
    };
  }

  if (script.status !== 'qa_failed') {
    return { success: false, error: 'Script is not in qa_failed status' };
  }

  // Perform the override
  const { error: updateError } = await supabase
    .from('script_runs')
    .update({
      status: 'qa_passed' as Enums<'script_status'>,
      qa_override_at: new Date().toISOString(),
      qa_override_by: options.overrideBy,
      qa_override_reason: options.reason,
      qa_passed_at: new Date().toISOString(),
    })
    .eq('id', options.scriptId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true };
}

// ============================================
// Regenerate Script
// ============================================
export async function regenerateScript(options: {
  scriptId: string;
  mode: 'ai' | 'template';
}): Promise<ScriptRunResult> {
  // Fetch the original script to get account and topic
  const { data: original, error } = await supabase
    .from('script_runs')
    .select('account_id, topic_id')
    .eq('id', options.scriptId)
    .single();

  if (error || !original) {
    return { success: false, error: 'Original script not found', warnings: [] };
  }

  // Create a new script run with the same account
  return createScriptRun({
    accountId: original.account_id,
    mode: options.mode,
  });
}

// ============================================
// List Account Configs from DB
// ============================================
export async function listAccountConfigs(): Promise<DbAccountConfig[]> {
  const { data, error } = await supabase
    .from('account_configs')
    .select('*')
    .order('account_id');

  if (error) {
    console.error('Failed to list account configs:', error);
    return [];
  }

  return data || [];
}

// ============================================
// List Available Pillars from DB
// ============================================
export async function listAvailablePillars(vertical: ContentVertical): Promise<string[]> {
  const { data, error } = await supabase
    .from('topic_bank')
    .select('pillar')
    .eq('vertical', vertical);

  if (error) {
    console.error('Failed to list pillars:', error);
    return [];
  }

  // Get unique pillars
  const pillars = [...new Set(data?.map(t => t.pillar) || [])];
  return pillars.sort();
}
