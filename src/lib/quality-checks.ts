// ============================================
// Quality Checks - Hook & CTA Validation
// ============================================
import type { AccountConfig } from "@/types/script-types";

// ============================================
// Hook Quality Check
// ============================================

// Concrete objects that make hooks specific
const CONCRETE_OBJECTS = [
  // Tech/Privacy
  "phone", "iphone", "android", "browser", "chrome", "safari", "firefox",
  "app", "apps", "setting", "settings", "password", "email", "data",
  "facebook", "instagram", "tiktok", "google", "apple", "amazon",
  "location", "camera", "microphone", "wifi", "bluetooth", "vpn",
  
  // Career/Education
  "resume", "interview", "job", "salary", "linkedin", "recruiter",
  "application", "cover letter", "portfolio", "skill", "degree",
  
  // Health
  "recovery", "exercise", "caregiver", "doctor", "therapy", "sleep",
  "brain", "stroke", "health", "wellness",
  
  // General specifics
  "website", "account", "profile", "notification", "permission",
];

// Patterns that indicate specificity
const SPECIFIC_PATTERNS = [
  /\d+\s+(settings?|tips?|ways?|steps?|things?|mistakes?|reasons?)/i,
  /\d+%/,
  /\d+\s+(seconds?|minutes?|hours?|days?)/i,
  /this\s+one\s+(setting|feature|trick|tip)/i,
  /right\s+now/i,
  /here's\s+(what|why|how)/i,
  /most\s+people\s+(don't|never|have no idea)/i,
  /stop\s+doing\s+this/i,
  /never\s+do\s+this/i,
];

// Vague patterns to reject
const VAGUE_PATTERNS = [
  /^did\s+you\s+know\s+this\??$/i,
  /^here's\s+a\s+tip\.?$/i,
  /^check\s+this\s+out\.?$/i,
  /^you\s+need\s+to\s+see\s+this\.?$/i,
  /^wait\s+for\s+it\.?$/i,
  /^watch\s+until\s+the\s+end\.?$/i,
  /^this\s+is\s+important\.?$/i,
  /^listen\s+up\.?$/i,
];

export interface HookCheckResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  score: number; // 0-100 quality score
}

export function checkHookQuality(hook: string): HookCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let score = 50; // Start at neutral
  
  const normalizedHook = hook.toLowerCase().trim();
  
  // Check for vague patterns (fail immediately)
  for (const pattern of VAGUE_PATTERNS) {
    if (pattern.test(normalizedHook)) {
      errors.push(`Hook is too vague: matches pattern "${pattern.source}"`);
      return { passed: false, errors, warnings, score: 10 };
    }
  }
  
  // Check for minimum length
  if (hook.length < 20) {
    errors.push("Hook is too short (minimum 20 characters)");
    score -= 30;
  }
  
  // Check for concrete objects
  const hasConcreteObject = CONCRETE_OBJECTS.some(obj => 
    normalizedHook.includes(obj)
  );
  
  if (hasConcreteObject) {
    score += 20;
  } else {
    warnings.push("Hook lacks concrete objects (phone, settings, resume, etc.)");
    score -= 10;
  }
  
  // Check for specific patterns
  const hasSpecificPattern = SPECIFIC_PATTERNS.some(pattern => 
    pattern.test(normalizedHook)
  );
  
  if (hasSpecificPattern) {
    score += 20;
  } else {
    warnings.push("Hook could be more specific (add numbers, timeframes, or specifics)");
  }
  
  // Check for action words
  const actionWords = ["go to", "check", "open", "find", "look for", "turn off", "disable", "enable", "stop", "never", "always"];
  const hasAction = actionWords.some(word => normalizedHook.includes(word));
  if (hasAction) {
    score += 10;
  }
  
  // Bonus for question format or direct address
  if (hook.includes("?") || normalizedHook.includes("your ") || normalizedHook.includes("you ")) {
    score += 5;
  }
  
  // Cap score
  score = Math.max(0, Math.min(100, score));
  
  // Determine pass/fail
  const passed = errors.length === 0 && score >= 40;
  
  if (score < 40 && errors.length === 0) {
    errors.push(`Hook quality score too low: ${score}/100 (minimum: 40)`);
  }
  
  return { passed, errors, warnings, score };
}

// ============================================
// CTA Alignment Check
// ============================================

export interface CtaCheckResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

// Allowed CTA patterns per vertical
const CTA_PATTERNS: Record<string, RegExp[]> = {
  privacy: [
    /check\s+(your\s+)?(digital\s+)?footprint/i,
    /scan\s+(your\s+)?data/i,
    /see\s+what('s)?\s+(data|info)/i,
    /download\s+footprint/i,
    /get\s+(your\s+)?free\s+(privacy\s+)?scan/i,
    /protect\s+(your|family)/i,
    /remove\s+(your\s+)?data/i,
    /privacy\s+shield/i,
  ],
  education: [
    /get\s+(the\s+)?(free\s+)?template/i,
    /download\s+(the\s+)?guide/i,
    /interview\s+cheat\s*sheet/i,
    /resume\s+template/i,
    /join\s+.*job\s*seekers/i,
    /boost\s+(your\s+)?career/i,
    /get\s+hired/i,
    /salary\s+negotiation/i,
  ],
  health: [
    /join\s+(our\s+)?(supportive\s+)?community/i,
    /connect\s+with\s+(other\s+)?survivors/i,
    /find\s+(caregiver\s+)?resources/i,
    /share\s+your\s+journey/i,
    /you('re)?\s+not\s+alone/i,
    /download\s+(the\s+)?checklist/i,
  ],
};

// Hard-banned CTA patterns
const BANNED_CTA_PATTERNS = [
  /buy\s+now/i,
  /limited\s+time/i,
  /act\s+now/i,
  /don't\s+miss\s+out/i,
  /exclusive\s+offer/i,
  /free\s+trial.*credit\s+card/i,
  /guaranteed\s+results/i,
];

export function checkCtaAlignment(cta: string, config: AccountConfig): CtaCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const normalizedCta = cta.toLowerCase().trim();
  
  // Check for banned patterns
  for (const pattern of BANNED_CTA_PATTERNS) {
    if (pattern.test(normalizedCta)) {
      errors.push(`CTA contains banned pattern: "${pattern.source}"`);
      return { passed: false, errors, warnings };
    }
  }
  
  // Check if CTA matches configured phrases (exact or close)
  const configuredPhrases = config.cta_phrases.map(p => p.toLowerCase());
  const matchesConfigured = configuredPhrases.some(phrase => 
    normalizedCta.includes(phrase.substring(0, 20)) || // First 20 chars
    phrase.includes(normalizedCta.substring(0, 20))
  );
  
  if (!matchesConfigured) {
    // Check against vertical patterns
    const verticalPatterns = CTA_PATTERNS[config.vertical] || [];
    const matchesVertical = verticalPatterns.some(pattern => pattern.test(normalizedCta));
    
    if (!matchesVertical) {
      warnings.push(`CTA doesn't match configured phrases or vertical patterns`);
      // Don't fail, just warn - allow some flexibility
    }
  }
  
  // Check CTA destination is mentioned if it's a download/get CTA
  if (/download|get\s+(the\s+)?free/i.test(normalizedCta) && !config.cta_destination) {
    warnings.push("Download/get CTA used but no cta_destination configured");
  }
  
  // Health-specific: ensure soft CTA for medical content
  if (config.vertical === "health" && config.cta_style === "soft") {
    const hardCtaPatterns = [/download\s+now/i, /sign\s+up\s+now/i, /get\s+it\s+now/i];
    for (const pattern of hardCtaPatterns) {
      if (pattern.test(normalizedCta)) {
        errors.push("Health account requires soft CTA style, but hard CTA detected");
        break;
      }
    }
  }
  
  return { passed: errors.length === 0, errors, warnings };
}

// ============================================
// Exercise Instruction Detection (Health Safety)
// ============================================

const EXERCISE_PATTERNS = [
  /do\s+this\s+exercise/i,
  /try\s+this\s+stretch/i,
  /repeat\s+\d+\s+times/i,
  /hold\s+for\s+\d+\s+seconds/i,
  /sets?\s+of\s+\d+/i,
  /reps?\s+of/i,
  /daily\s+exercise/i,
  /physical\s+therapy\s+exercise/i,
];

export function detectExerciseInstructions(text: string): string[] {
  const flags: string[] = [];
  const normalizedText = text.toLowerCase();
  
  for (const pattern of EXERCISE_PATTERNS) {
    if (pattern.test(normalizedText)) {
      flags.push(`EXERCISE_INSTRUCTION: ${pattern.source}`);
    }
  }
  
  return flags;
}

// ============================================
// Privacy: Allowed Settings Patterns
// ============================================

const ALLOWED_SETTINGS_PATTERNS = [
  /go\s+to\s+settings/i,
  /open\s+settings/i,
  /turn\s+off/i,
  /disable\s+this/i,
  /enable\s+this/i,
  /check\s+(your\s+)?permissions/i,
  /look\s+for\s+this\s+option/i,
  /toggle\s+(this\s+)?off/i,
  /uncheck\s+this/i,
];

export function isAllowedPrivacyInstruction(text: string): boolean {
  const normalizedText = text.toLowerCase();
  return ALLOWED_SETTINGS_PATTERNS.some(pattern => pattern.test(normalizedText));
}
