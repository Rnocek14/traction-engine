// ============================================
// Script Generator - 3-Phase Pipeline
// ============================================
import type { 
  ScriptContent, 
  ScriptRun, 
  AccountConfig, 
  ContentPolicy,
  Topic,
  QAResult 
} from "@/types/script-types";
import { 
  generateScriptFingerprints, 
  validateScriptContent 
} from "@/types/script-types";
import { 
  runScriptQA, 
  extractFactClaims, 
  detectSafetyFlags,
  checkUniqueness 
} from "@/lib/content-qa";
import { 
  getAccountConfig, 
  getContentPolicy, 
  getAvailableTopics,
  TOPIC_BANK 
} from "@/data/show-bible";
import { checkHookQuality, checkCtaAlignment } from "@/lib/quality-checks";

// ============================================
// Types
// ============================================
export interface GenerationResult {
  success: boolean;
  scriptRun?: ScriptRun;
  error?: string;
  qaResult?: QAResult;
  warnings: string[];
}

interface RecentFingerprint {
  hook_hash: string;
  voiceover_hash: string;
  account_id: string;
  created_at: string;
}

// ============================================
// Phase A: Topic Selection
// ============================================
export function selectTopic(
  accountId: string,
  lastUsedTopics: Map<string, Date> = new Map(),
  preferredPillar?: string
): Topic | null {
  const config = getAccountConfig(accountId);
  if (!config) return null;

  // Get available topics respecting cooldown
  let candidates = getAvailableTopics(accountId, lastUsedTopics);
  
  // Filter by pillar if specified
  if (preferredPillar) {
    candidates = candidates.filter(t => t.pillar === preferredPillar);
  }
  
  if (candidates.length === 0) {
    // Fallback: get any topic from the vertical, ignoring cooldown
    candidates = TOPIC_BANK.filter(t => t.vertical === config.vertical);
  }
  
  if (candidates.length === 0) return null;
  
  // Weight by times_used (favor less-used topics)
  const weightedCandidates = candidates.map(topic => ({
    topic,
    weight: 1 / (topic.times_used + 1), // Less used = higher weight
  }));
  
  const totalWeight = weightedCandidates.reduce((sum, c) => sum + c.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const { topic, weight } of weightedCandidates) {
    random -= weight;
    if (random <= 0) return topic;
  }
  
  return candidates[0]; // Fallback
}

// ============================================
// Phase B: Generate Script Content (Mock LLM)
// ============================================
export function generateScriptContent(
  config: AccountConfig,
  topic: Topic
): ScriptContent {
  // Select a random hook variant
  const hookVariants = topic.hook_variants.length > 0 
    ? topic.hook_variants 
    : [topic.topic_prompt];
  const hook = hookVariants[Math.floor(Math.random() * hookVariants.length)];
  
  // Generate voiceover based on topic and persona
  const voiceover = generateVoiceover(config, topic, hook);
  
  // Generate on-screen text
  const onScreenText = generateOnScreenText(voiceover);
  
  // Generate scene prompts
  const scenePrompts = generateScenePrompts(topic, config.vertical);
  
  // Select CTA
  const cta = config.cta_phrases.length > 0
    ? config.cta_phrases[Math.floor(Math.random() * config.cta_phrases.length)]
    : topic.suggested_cta || "Learn more";
  
  // Generate caption
  const caption = generateCaption(hook, cta);
  
  // Generate hashtags
  const hashtags = generateHashtags(config.vertical, topic.pillar, topic.trend_keywords);
  
  // Disclaimer (required for health)
  const disclaimer = config.vertical === "health" || config.disclaimer_rules.always_required
    ? "This is not medical advice. Always consult your healthcare provider."
    : undefined;
  
  return {
    hook,
    voiceover,
    on_screen_text: onScreenText,
    scene_prompts: scenePrompts,
    broll_keywords: topic.motif_hints,
    caption,
    hashtags,
    cta,
    disclaimer,
  };
}

function generateVoiceover(config: AccountConfig, topic: Topic, hook: string): string {
  // Template-based voiceover generation
  // In production, this would call an LLM
  
  const templates: Record<string, string[]> = {
    privacy: [
      `${hook} Most people have no idea this is happening, but here's the truth. ${topic.topic_prompt}. The good news? You can fix this in about 30 seconds. Go to your settings right now and look for this option. Turn it off, and you've just taken back control of your data. ${config.promise}. ${config.cta_phrases[0] || 'Check your digital footprint today.'}`,
      `${hook} I discovered this when I was checking my own settings, and I couldn't believe what I found. ${topic.topic_prompt}. Here's exactly what you need to do. First, open your settings. Look for privacy or security. Find this specific option and disable it. That's it. You've just protected yourself. ${config.cta_phrases[0] || 'Want to see what else is exposed?'}`,
    ],
    education: [
      `${hook} After reviewing thousands of applications, I've seen this mistake way too many times. ${topic.topic_prompt}. Here's the fix that actually works. Instead of doing it the old way, try this approach. It takes the same amount of time but gets completely different results. ${config.promise}. ${config.cta_phrases[0] || 'Get more tips like this.'}`,
      `${hook} This is what separates candidates who get callbacks from those who don't. ${topic.topic_prompt}. The key is being specific and showing impact. Use numbers when you can. Show results, not just responsibilities. That's how you stand out. ${config.cta_phrases[0] || 'Download the full guide.'}`,
    ],
    health: [
      `${hook} Recovery looks different for everyone, and that's completely okay. ${topic.topic_prompt}. What matters most is taking it one day at a time. Remember, progress isn't always linear. Some days will be harder than others. But you're not alone in this journey. ${config.promise}. Always consult your healthcare provider before starting anything new. ${config.cta_phrases[0] || 'Join our supportive community.'}`,
      `${hook} If you're feeling frustrated with your recovery, I want you to know something important. ${topic.topic_prompt}. Small wins matter. Every tiny step forward is still progress. Be patient with yourself. Your journey is unique, and comparing yourself to others doesn't help. ${config.cta_phrases[0] || 'Connect with other survivors.'}`,
    ],
  };
  
  const verticalTemplates = templates[config.vertical] || templates.privacy;
  return verticalTemplates[Math.floor(Math.random() * verticalTemplates.length)];
}

function generateOnScreenText(voiceover: string): Array<{ timestamp: number; text: string }> {
  // Extract key phrases for on-screen text
  const sentences = voiceover.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const keyPhrases = sentences.slice(0, 4).map(s => {
    // Extract first 5-7 words
    const words = s.trim().split(/\s+/).slice(0, 6);
    return words.join(' ').trim();
  });
  
  return keyPhrases.map((text, i) => ({
    timestamp: i * 8 + 2, // Every 8 seconds, starting at 2s
    text: text.substring(0, 50), // Max 50 chars
  }));
}

function generateScenePrompts(topic: Topic, vertical: string): string[] {
  const basePrompts: Record<string, string[]> = {
    privacy: [
      "Person looking concerned at phone screen in modern living room",
      "Close-up of smartphone settings menu being navigated",
      "Person smiling with relief after completing task on phone",
    ],
    education: [
      "Professional in business attire reviewing resume on laptop",
      "Person confidently speaking in job interview setting",
      "Celebration moment after receiving good news on phone",
    ],
    health: [
      "Person in comfortable setting looking peaceful and hopeful",
      "Supportive hands holding or gentle encouraging gesture",
      "Sunrise or calming nature scene representing new beginnings",
    ],
  };
  
  const prompts = basePrompts[vertical] || basePrompts.privacy;
  
  // Add topic-specific hints
  if (topic.motif_hints.length > 0) {
    const hint = topic.motif_hints[0];
    prompts[0] = `${prompts[0]}, ${hint}`;
  }
  
  return prompts;
}

function generateCaption(hook: string, cta: string): string {
  // Clean hook for caption (remove periods)
  const cleanHook = hook.replace(/[.!?]+$/, '');
  return `${cleanHook}. ${cta} 👇`;
}

function generateHashtags(vertical: string, pillar: string, trendKeywords: string[]): string[] {
  const baseHashtags: Record<string, string[]> = {
    privacy: ["privacy", "datasecurity", "protectyourself", "techtips"],
    education: ["career", "jobsearch", "resumetips", "interviewtips"],
    health: ["recovery", "strokesurvivor", "healing", "support"],
  };
  
  const tags = [...(baseHashtags[vertical] || [])];
  
  // Add pillar-based tag
  const pillarTag = pillar.toLowerCase().replace(/\s+/g, '');
  if (!tags.includes(pillarTag)) tags.push(pillarTag);
  
  // Add trend keywords (cleaned)
  for (const keyword of trendKeywords.slice(0, 2)) {
    const cleanTag = keyword.toLowerCase().replace(/\s+/g, '');
    if (!tags.includes(cleanTag)) tags.push(cleanTag);
  }
  
  return tags.slice(0, 8); // Max 8 hashtags
}

// ============================================
// Phase C: QA Gate + Fingerprint
// ============================================
export interface QAGateResult {
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

export function runQAGate(
  content: ScriptContent,
  config: AccountConfig,
  recentFingerprints: RecentFingerprint[] = []
): QAGateResult {
  // Get content policy
  const policy = getContentPolicy(config.vertical);
  
  // Run QA checks
  const qaResult = runScriptQA(content, config, policy || null, {
    recentFingerprints,
    skipUniqueness: recentFingerprints.length === 0,
  });
  
  // Extract fact claims
  const factClaims = extractFactClaims(content);
  
  // Detect safety flags
  const safetyFlags = detectSafetyFlags(content, config.vertical);
  
  // Generate fingerprints
  const fingerprints = generateScriptFingerprints(content);
  
  // Quality checks
  const qualityWarnings: string[] = [];
  
  // Hook quality check
  const hookCheck = checkHookQuality(content.hook);
  if (!hookCheck.passed) {
    qaResult.errors.push(...hookCheck.errors);
    qaResult.passed = false;
    qaResult.checks.structure_valid = false;
  }
  qualityWarnings.push(...hookCheck.warnings);
  
  // CTA alignment check
  const ctaCheck = checkCtaAlignment(content.cta, config);
  if (!ctaCheck.passed) {
    qaResult.errors.push(...ctaCheck.errors);
    qaResult.passed = false;
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
  }
  
  // If there are hard blocks, QA fails
  if (hardBlockFlags.length > 0) {
    qaResult.passed = false;
    qaResult.errors.push(`Hard block flags detected: ${hardBlockFlags.join(', ')}`);
  }
  
  return {
    passed: qaResult.passed && hardBlockFlags.length === 0,
    qaResult,
    safetyFlags,
    hardBlockFlags,
    factClaims,
    fingerprints,
    qualityWarnings,
  };
}

// ============================================
// Main Generator Function
// ============================================
export function generateScriptRun(
  accountId: string,
  options: {
    preferredPillar?: string;
    recentFingerprints?: RecentFingerprint[];
    lastUsedTopics?: Map<string, Date>;
  } = {}
): GenerationResult {
  const warnings: string[] = [];
  
  // Get account config
  const config = getAccountConfig(accountId);
  if (!config) {
    return {
      success: false,
      error: `Account config not found for ID: ${accountId}`,
      warnings,
    };
  }
  
  // Phase A: Select topic
  const topic = selectTopic(
    accountId, 
    options.lastUsedTopics || new Map(),
    options.preferredPillar
  );
  
  if (!topic) {
    return {
      success: false,
      error: `No available topics for account ${accountId} (vertical: ${config.vertical})`,
      warnings,
    };
  }
  
  // Phase B: Generate content
  const content = generateScriptContent(config, topic);
  
  // Validate structure
  const validation = validateScriptContent(content);
  if (!validation.valid) {
    return {
      success: false,
      error: `Content validation failed: ${validation.errors.join(', ')}`,
      warnings,
    };
  }
  
  // Phase C: QA Gate
  const qaGate = runQAGate(
    content, 
    config, 
    options.recentFingerprints || []
  );
  
  warnings.push(...qaGate.qualityWarnings);
  warnings.push(...qaGate.qaResult.warnings);
  
  // Create script run record
  const scriptRun: ScriptRun = {
    id: crypto.randomUUID(),
    account_id: accountId,
    topic_id: topic.id,
    status: qaGate.passed ? "qa_passed" : "qa_failed",
    script_content: content,
    qa_results: qaGate.qaResult,
    qa_passed_at: qaGate.passed ? new Date().toISOString() : undefined,
    qa_failed_reason: !qaGate.passed ? qaGate.qaResult.errors.join('; ') : undefined,
    safety_flags: qaGate.safetyFlags,
    fact_claims: qaGate.factClaims,
    generation_cost_cents: 1, // Mock cost
    hook_hash: qaGate.fingerprints.hook_hash,
    voiceover_hash: qaGate.fingerprints.voiceover_hash,
    scene_hash: qaGate.fingerprints.scene_hash,
    created_at: new Date().toISOString(),
  };
  
  return {
    success: true,
    scriptRun,
    qaResult: qaGate.qaResult,
    warnings,
  };
}

// ============================================
// Batch Generator
// ============================================
export function generateBatch(
  accountId: string,
  count: number,
  options: {
    preferredPillar?: string;
  } = {}
): GenerationResult[] {
  const results: GenerationResult[] = [];
  const fingerprints: RecentFingerprint[] = [];
  const lastUsedTopics = new Map<string, Date>();
  
  for (let i = 0; i < count; i++) {
    const result = generateScriptRun(accountId, {
      ...options,
      recentFingerprints: fingerprints,
      lastUsedTopics,
    });
    
    results.push(result);
    
    // Add fingerprint for uniqueness check
    if (result.scriptRun) {
      fingerprints.push({
        hook_hash: result.scriptRun.hook_hash || '',
        voiceover_hash: result.scriptRun.voiceover_hash || '',
        account_id: accountId,
        created_at: result.scriptRun.created_at,
      });
      
      // Track topic usage
      if (result.scriptRun.topic_id) {
        lastUsedTopics.set(result.scriptRun.topic_id, new Date());
      }
    }
  }
  
  return results;
}
