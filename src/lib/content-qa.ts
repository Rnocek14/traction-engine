// ============================================
// Content QA - Policy Compliance & Validation
// ============================================
import type { 
  ScriptContent, 
  AccountConfig, 
  ContentPolicy, 
  QAResult,
  ClaimPolicyLevel 
} from "@/types/script-types";
import { validateScriptContent, generateScriptFingerprints } from "@/types/script-types";

// ============================================
// Health-specific banned phrases
// ============================================
const HEALTH_BANNED_PHRASES = [
  "cure",
  "cures",
  "guaranteed",
  "miracle",
  "heal",
  "heals",
  "treatment plan",
  "prescription",
  "dosage",
  "diagnosis",
  "diagnose",
  "medical advice",
  "doctor recommended",
  "clinically proven",
  "FDA approved", // unless actually true
  "100% effective",
  "no side effects",
];

const HEALTH_REQUIRED_DISCLAIMERS = [
  "consult your doctor",
  "talk to your healthcare provider",
  "not medical advice",
  "consult a medical professional",
  "speak with your clinician",
];

// ============================================
// Privacy-specific safety rules
// ============================================
const PRIVACY_BANNED_PHRASES = [
  "hack",
  "hacking",
  "exploit",
  "bypass security",
  "crack password",
  "steal data",
  "illegal",
  "unauthorized access",
];

// ============================================
// QA Check Functions
// ============================================

function checkStructure(content: ScriptContent): { passed: boolean; errors: string[] } {
  const validation = validateScriptContent(content);
  return {
    passed: validation.valid,
    errors: validation.errors,
  };
}

function checkLength(content: ScriptContent, maxSeconds: number): { passed: boolean; errors: string[] } {
  // Rough estimate: 150 words per minute = 2.5 words per second
  const wordCount = content.voiceover.split(/\s+/).length;
  const estimatedSeconds = wordCount / 2.5;
  
  if (estimatedSeconds > maxSeconds) {
    return {
      passed: false,
      errors: [`Voiceover too long: ~${Math.round(estimatedSeconds)}s (max: ${maxSeconds}s)`],
    };
  }
  return { passed: true, errors: [] };
}

function checkBannedTopics(
  content: ScriptContent, 
  accountBanned: string[], 
  policyBanned: string[]
): { passed: boolean; errors: string[] } {
  const allBanned = [...accountBanned, ...policyBanned].map(b => b.toLowerCase());
  const fullText = `${content.hook} ${content.voiceover} ${content.caption}`.toLowerCase();
  
  const found: string[] = [];
  for (const banned of allBanned) {
    if (fullText.includes(banned)) {
      found.push(banned);
    }
  }
  
  if (found.length > 0) {
    return {
      passed: false,
      errors: [`Banned topics found: ${found.join(', ')}`],
    };
  }
  return { passed: true, errors: [] };
}

function checkClaimPolicy(
  content: ScriptContent,
  vertical: string,
  claimPolicy: ClaimPolicyLevel
): { passed: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fullText = `${content.hook} ${content.voiceover}`.toLowerCase();
  
  // Health vertical with strict/medical policy
  if (vertical === "health" && (claimPolicy === "strict" || claimPolicy === "medical")) {
    for (const phrase of HEALTH_BANNED_PHRASES) {
      if (fullText.includes(phrase.toLowerCase())) {
        errors.push(`Health claim violation: "${phrase}" not allowed`);
      }
    }
  }
  
  // Privacy vertical checks
  if (vertical === "privacy") {
    for (const phrase of PRIVACY_BANNED_PHRASES) {
      if (fullText.includes(phrase.toLowerCase())) {
        if (claimPolicy === "strict" || claimPolicy === "medical") {
          errors.push(`Privacy policy violation: "${phrase}" not allowed`);
        } else {
          warnings.push(`Consider removing: "${phrase}"`);
        }
      }
    }
  }
  
  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}

function checkDisclaimerRequired(
  content: ScriptContent,
  vertical: string,
  disclaimerRules: { always_required: boolean; trigger_keywords: string[] }
): { passed: boolean; errors: string[] } {
  const fullText = `${content.voiceover}`.toLowerCase();
  
  // Check if disclaimer is present
  const hasDisclaimer = content.disclaimer && content.disclaimer.length > 0;
  
  // Health always needs disclaimer
  if (vertical === "health") {
    if (!hasDisclaimer) {
      // Check if any health disclaimer phrase is in voiceover
      const hasInlineDisclaimer = HEALTH_REQUIRED_DISCLAIMERS.some(d => 
        fullText.includes(d.toLowerCase())
      );
      if (!hasInlineDisclaimer) {
        return {
          passed: false,
          errors: ["Health content requires disclaimer or inline safety language"],
        };
      }
    }
  }
  
  // Always required
  if (disclaimerRules.always_required && !hasDisclaimer) {
    return {
      passed: false,
      errors: ["Disclaimer is required for this account"],
    };
  }
  
  // Trigger keywords
  for (const keyword of disclaimerRules.trigger_keywords) {
    if (fullText.includes(keyword.toLowerCase()) && !hasDisclaimer) {
      return {
        passed: false,
        errors: [`Keyword "${keyword}" requires a disclaimer`],
      };
    }
  }
  
  return { passed: true, errors: [] };
}

// ============================================
// Uniqueness Check (against recent scripts)
// ============================================

interface RecentFingerprint {
  hook_hash: string;
  voiceover_hash: string;
  account_id: string;
  created_at: string;
}

export function checkUniqueness(
  content: ScriptContent,
  accountId: string,
  recentFingerprints: RecentFingerprint[],
  options: {
    maxHookReuse: number; // how many times same hook can appear
    minDaysBetweenSimilar: number;
  } = { maxHookReuse: 2, minDaysBetweenSimilar: 7 }
): { passed: boolean; errors: string[]; warnings: string[] } {
  const fingerprints = generateScriptFingerprints(content);
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Count hook reuse
  const hookMatches = recentFingerprints.filter(f => f.hook_hash === fingerprints.hook_hash);
  if (hookMatches.length >= options.maxHookReuse) {
    errors.push(`Hook pattern reused too often (${hookMatches.length} times)`);
  }
  
  // Check for exact voiceover match
  const voiceoverMatch = recentFingerprints.find(f => 
    f.voiceover_hash === fingerprints.voiceover_hash
  );
  if (voiceoverMatch) {
    errors.push("Nearly identical voiceover found in recent scripts");
  }
  
  // Check same account recent similarity
  const sameAccountRecent = recentFingerprints.filter(f => {
    if (f.account_id !== accountId) return false;
    const daysDiff = (Date.now() - new Date(f.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff < options.minDaysBetweenSimilar;
  });
  
  const sameAccountSimilar = sameAccountRecent.filter(f => 
    f.hook_hash === fingerprints.hook_hash || 
    f.voiceover_hash === fingerprints.voiceover_hash
  );
  
  if (sameAccountSimilar.length > 0) {
    warnings.push(`Similar content posted to same account within ${options.minDaysBetweenSimilar} days`);
  }
  
  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================
// Main QA Pipeline
// ============================================

export interface QACheckOptions {
  recentFingerprints?: RecentFingerprint[];
  skipUniqueness?: boolean;
}

export function runScriptQA(
  content: ScriptContent,
  accountConfig: AccountConfig,
  contentPolicy: ContentPolicy | null,
  options: QACheckOptions = {}
): QAResult {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];
  
  // 1. Structure validation
  const structureCheck = checkStructure(content);
  
  // 2. Length check
  const lengthCheck = checkLength(content, accountConfig.style_rules.max_length_seconds);
  
  // 3. Banned topics
  const bannedCheck = checkBannedTopics(
    content,
    accountConfig.banned_topics,
    contentPolicy?.banned_phrases || []
  );
  
  // 4. Claim policy compliance
  const claimCheck = checkClaimPolicy(
    content,
    accountConfig.vertical,
    accountConfig.claim_policy
  );
  
  // 5. Disclaimer check
  const disclaimerCheck = checkDisclaimerRequired(
    content,
    accountConfig.vertical,
    accountConfig.disclaimer_rules
  );
  
  // 6. Uniqueness check (if fingerprints provided)
  let uniquenessCheck = { passed: true, errors: [] as string[], warnings: [] as string[] };
  if (!options.skipUniqueness && options.recentFingerprints) {
    uniquenessCheck = checkUniqueness(
      content,
      accountConfig.account_id,
      options.recentFingerprints
    );
  }
  
  // Aggregate all errors and warnings
  allErrors.push(...structureCheck.errors);
  allErrors.push(...lengthCheck.errors);
  allErrors.push(...bannedCheck.errors);
  allErrors.push(...claimCheck.errors);
  allErrors.push(...disclaimerCheck.errors);
  allErrors.push(...uniquenessCheck.errors);
  
  allWarnings.push(...claimCheck.warnings);
  allWarnings.push(...uniquenessCheck.warnings);
  
  return {
    passed: allErrors.length === 0,
    checks: {
      structure_valid: structureCheck.passed,
      length_valid: lengthCheck.passed,
      banned_topics_clear: bannedCheck.passed,
      claim_policy_compliant: claimCheck.passed,
      disclaimer_present: disclaimerCheck.passed,
      uniqueness_valid: uniquenessCheck.passed,
    },
    errors: allErrors,
    warnings: allWarnings,
  };
}

// ============================================
// Extract fact claims for verification
// ============================================

export function extractFactClaims(content: ScriptContent): string[] {
  const claims: string[] = [];
  const text = content.voiceover;
  
  // Pattern matching for common claim structures
  const claimPatterns = [
    /(\d+%\s+of\s+[^.]+)/gi, // "X% of people..."
    /(studies\s+show\s+[^.]+)/gi, // "Studies show..."
    /(research\s+(?:shows|proves|indicates)\s+[^.]+)/gi,
    /(according\s+to\s+[^,]+,\s+[^.]+)/gi, // "According to X, ..."
    /(experts\s+(?:say|recommend|advise)\s+[^.]+)/gi,
    /(\d+\s+(?:million|billion|thousand)\s+[^.]+)/gi, // Statistics
  ];
  
  for (const pattern of claimPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      claims.push(...matches);
    }
  }
  
  return [...new Set(claims)]; // Deduplicate
}

// ============================================
// Safety flag detection
// ============================================

export function detectSafetyFlags(content: ScriptContent, vertical: string): string[] {
  const flags: string[] = [];
  const text = `${content.hook} ${content.voiceover}`.toLowerCase();
  
  // Universal flags
  if (text.includes("guarantee") || text.includes("guaranteed")) {
    flags.push("GUARANTEE_CLAIM");
  }
  
  if (text.includes("100%") || text.includes("always works")) {
    flags.push("ABSOLUTE_CLAIM");
  }
  
  // Health-specific
  if (vertical === "health") {
    if (text.includes("cure") || text.includes("heal")) {
      flags.push("MEDICAL_CURE_CLAIM");
    }
    if (text.includes("treatment") && !text.includes("not medical advice")) {
      flags.push("TREATMENT_CLAIM_NO_DISCLAIMER");
    }
  }
  
  // Privacy-specific
  if (vertical === "privacy") {
    if (text.includes("illegal") || text.includes("hack")) {
      flags.push("POTENTIALLY_ILLEGAL_CONTENT");
    }
  }
  
  return flags;
}
