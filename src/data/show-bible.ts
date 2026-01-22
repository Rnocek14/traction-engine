// ============================================
// Mock Show Bible Configs for Initial Accounts
// ============================================
import type { AccountConfig, ContentPolicy, Topic } from "@/types/script-types";

// ============================================
// Show Bible Configs (one per account)
// ============================================
export const ACCOUNT_CONFIGS: AccountConfig[] = [
  {
    id: "config-1",
    account_id: "1",
    vertical: "privacy",
    persona: {
      tone: "urgent-but-helpful",
      vibe: "tech-savvy friend",
    },
    audience: {
      who: "Privacy-conscious adults 25-45 who feel overwhelmed by data tracking",
      pain_points: [
        "Don't know what data is collected about them",
        "Feel helpless against big tech",
        "Worried about identity theft",
        "Overwhelmed by privacy settings",
      ],
    },
    promise: "Simple, actionable privacy tips you can do in 60 seconds or less",
    content_pillars: [
      "Data Broker Removal",
      "Phone Privacy Settings",
      "Browser Protection",
      "Social Media Privacy",
      "Identity Protection",
    ],
    banned_topics: [
      "hacking tutorials",
      "illegal activities",
      "VPN promotions",
      "specific company attacks",
    ],
    claim_policy: "moderate",
    cta_style: "soft",
    cta_destination: "https://footprintfinder.app",
    cta_phrases: [
      "Check your digital footprint",
      "See what data is out there about you",
      "Download Footprint Finder",
      "Get your free privacy scan",
    ],
    style_rules: {
      max_length_seconds: 45,
      pacing: "fast",
      profanity: false,
      emoji_allowed: true,
    },
    disclaimer_rules: {
      always_required: false,
      trigger_keywords: ["lawsuit", "legal", "sue"],
    },
    uniqueness_salt: "fp-finder-salt-001",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "config-2",
    account_id: "2",
    vertical: "privacy",
    persona: {
      tone: "protective",
      vibe: "security expert",
    },
    audience: {
      who: "Security-aware professionals and parents",
      pain_points: [
        "Worried about family data exposure",
        "Need enterprise-level protection for personal life",
        "Data breaches keep happening",
      ],
    },
    promise: "Enterprise-grade privacy protection for everyday people",
    content_pillars: [
      "Data Breach Response",
      "Family Privacy",
      "Work-Life Data Separation",
      "Password Security",
      "Phishing Prevention",
    ],
    banned_topics: [
      "fear mongering",
      "conspiracy theories",
      "specific hacker groups",
    ],
    claim_policy: "moderate",
    cta_style: "soft",
    cta_destination: "https://privacyshield.io",
    cta_phrases: [
      "Protect your family's data",
      "Get Privacy Shield",
      "Start your free trial",
    ],
    style_rules: {
      max_length_seconds: 60,
      pacing: "medium",
      profanity: false,
      emoji_allowed: true,
    },
    disclaimer_rules: {
      always_required: false,
      trigger_keywords: [],
    },
    uniqueness_salt: "priv-shield-salt-002",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "config-3",
    account_id: "3",
    vertical: "education",
    persona: {
      tone: "encouraging",
      vibe: "career mentor",
    },
    audience: {
      who: "Job seekers and career changers 22-40",
      pain_points: [
        "Getting ghosted by employers",
        "Resume not getting responses",
        "Don't know how to stand out",
        "Career pivot anxiety",
      ],
    },
    promise: "Insider career tips that actually get you hired",
    content_pillars: [
      "Resume Optimization",
      "Interview Prep",
      "LinkedIn Strategy",
      "Salary Negotiation",
      "Career Transitions",
    ],
    banned_topics: [
      "get rich quick",
      "MLM",
      "crypto careers",
      "specific company criticism",
    ],
    claim_policy: "standard",
    cta_style: "direct",
    cta_destination: "https://careerboosthq.com",
    cta_phrases: [
      "Get my free resume template",
      "Download the interview cheat sheet",
      "Join 50k+ job seekers",
      "Boost your career today",
    ],
    style_rules: {
      max_length_seconds: 60,
      pacing: "medium",
      profanity: false,
      emoji_allowed: true,
    },
    disclaimer_rules: {
      always_required: false,
      trigger_keywords: ["salary guarantee", "job guarantee"],
    },
    uniqueness_salt: "career-boost-salt-003",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "config-5",
    account_id: "5",
    vertical: "health",
    persona: {
      tone: "compassionate",
      vibe: "supportive guide",
    },
    audience: {
      who: "Stroke survivors and their caregivers",
      pain_points: [
        "Feeling isolated in recovery",
        "Don't know what exercises are safe",
        "Overwhelmed by medical information",
        "Need daily motivation",
      ],
    },
    promise: "Daily encouragement and gentle guidance for stroke recovery",
    content_pillars: [
      "Recovery Motivation",
      "Caregiver Support",
      "General Wellness",
      "Community Stories",
      "Resource Navigation",
    ],
    banned_topics: [
      "medical advice",
      "treatment recommendations",
      "medication",
      "specific exercises without disclaimer",
      "cure claims",
      "recovery timelines",
    ],
    claim_policy: "medical",
    cta_style: "soft",
    cta_destination: "https://strokerecovery.community",
    cta_phrases: [
      "Join our supportive community",
      "You're not alone in this journey",
      "Connect with other survivors",
    ],
    style_rules: {
      max_length_seconds: 45,
      pacing: "slow",
      profanity: false,
      emoji_allowed: true,
    },
    disclaimer_rules: {
      always_required: true,
      trigger_keywords: ["exercise", "movement", "therapy", "treatment"],
    },
    uniqueness_salt: "stroke-recovery-salt-005",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// ============================================
// Content Policies (per vertical)
// ============================================
export const CONTENT_POLICIES: ContentPolicy[] = [
  {
    id: "policy-privacy",
    vertical: "privacy",
    banned_phrases: [
      "hack into",
      "steal password",
      "bypass security",
      "illegal method",
      "dark web tutorial",
    ],
    required_disclaimers: [],
    prohibited_claim_types: [
      "guaranteed protection",
      "100% anonymous",
      "untraceable",
    ],
    fact_check_required: false,
    safety_rules: {
      max_fear_level: 3,
      require_actionable_solution: true,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "policy-education",
    vertical: "education",
    banned_phrases: [
      "guaranteed job",
      "instant success",
      "get rich",
      "no experience needed",
    ],
    required_disclaimers: [],
    prohibited_claim_types: [
      "guaranteed employment",
      "specific salary promises",
    ],
    fact_check_required: false,
    safety_rules: {
      avoid_unrealistic_expectations: true,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "policy-health",
    vertical: "health",
    banned_phrases: [
      "cure",
      "heal",
      "treatment plan",
      "prescription",
      "diagnosis",
      "medical advice",
      "guaranteed recovery",
      "miracle",
      "proven to work",
    ],
    required_disclaimers: [
      "This is not medical advice. Always consult your healthcare provider.",
      "Consult your doctor before starting any new activity.",
    ],
    prohibited_claim_types: [
      "cure claims",
      "treatment recommendations",
      "medication advice",
      "recovery guarantees",
    ],
    fact_check_required: true,
    safety_rules: {
      require_medical_disclaimer: true,
      avoid_specific_exercises: true,
      encourage_professional_consultation: true,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// ============================================
// Topic Bank (100+ topics across verticals)
// ============================================
export const TOPIC_BANK: Topic[] = [
  // =========== PRIVACY: Data Brokers ===========
  {
    id: "topic-priv-001",
    vertical: "privacy",
    pillar: "Data Broker Removal",
    topic_prompt: "Most people don't know data brokers are selling their home address right now",
    hook_variants: [
      "Your home address is for sale right now. Here's who's buying it.",
      "I just found my address on 47 different websites. Here's how to remove it.",
      "Data brokers made $200 billion last year selling YOUR information.",
    ],
    claim_sensitivity: 2,
    suggested_cta: "Check your digital footprint",
    motif_hints: ["typing on phone", "worried expression", "data visualization"],
    is_evergreen: true,
    seasonal_tags: [],
    trend_keywords: ["data broker", "privacy", "personal information"],
    times_used: 0,
    cooldown_days: 14,
    created_at: new Date().toISOString(),
  },
  {
    id: "topic-priv-002",
    vertical: "privacy",
    pillar: "Data Broker Removal",
    topic_prompt: "The opt-out process data brokers hope you never discover",
    hook_variants: [
      "Data brokers are legally required to remove you. Most won't tell you that.",
      "I removed myself from 200+ data broker sites. Here's the exact process.",
      "This one law forces data brokers to delete your info.",
    ],
    claim_sensitivity: 1,
    suggested_cta: "Get your free removal guide",
    motif_hints: ["clicking through websites", "checkmark animation", "success"],
    is_evergreen: true,
    seasonal_tags: [],
    trend_keywords: ["opt out", "CCPA", "data removal"],
    times_used: 0,
    cooldown_days: 10,
    created_at: new Date().toISOString(),
  },
  {
    id: "topic-priv-003",
    vertical: "privacy",
    pillar: "Phone Privacy Settings",
    topic_prompt: "Your iPhone is tracking every location you visit and storing it forever",
    hook_variants: [
      "Your iPhone has a secret map of everywhere you've been. Here's how to see it.",
      "Apple is storing years of your location history. Most people never check this setting.",
      "I found 3 years of my location data on my iPhone. This setting was on by default.",
    ],
    claim_sensitivity: 1,
    suggested_cta: "Check your privacy settings",
    motif_hints: ["iPhone settings", "map pins", "location data"],
    is_evergreen: true,
    seasonal_tags: [],
    trend_keywords: ["iPhone", "location tracking", "privacy settings"],
    times_used: 0,
    cooldown_days: 7,
    created_at: new Date().toISOString(),
  },
  {
    id: "topic-priv-004",
    vertical: "privacy",
    pillar: "Phone Privacy Settings",
    topic_prompt: "Apps that are accessing your microphone without you knowing",
    hook_variants: [
      "These 5 apps are listening to you right now. Check your permissions.",
      "Your phone's microphone is active more than you think. Here's how to check.",
      "I found 12 apps with microphone access I never approved.",
    ],
    claim_sensitivity: 2,
    suggested_cta: "Scan your app permissions",
    motif_hints: ["microphone icon", "app icons", "permission popup"],
    is_evergreen: true,
    seasonal_tags: [],
    trend_keywords: ["microphone", "app permissions", "spying"],
    times_used: 0,
    cooldown_days: 7,
    created_at: new Date().toISOString(),
  },
  {
    id: "topic-priv-005",
    vertical: "privacy",
    pillar: "Browser Protection",
    topic_prompt: "Browser fingerprinting lets websites track you without cookies",
    hook_variants: [
      "Deleting cookies doesn't stop tracking anymore. Here's what does.",
      "Your browser has a unique fingerprint. Websites use it to follow you everywhere.",
      "I blocked all cookies but websites still knew it was me. Here's why.",
    ],
    claim_sensitivity: 2,
    suggested_cta: "Test your browser fingerprint",
    motif_hints: ["fingerprint graphic", "browser window", "tracking visualization"],
    is_evergreen: true,
    seasonal_tags: [],
    trend_keywords: ["browser fingerprint", "tracking", "cookies"],
    times_used: 0,
    cooldown_days: 10,
    created_at: new Date().toISOString(),
  },
  
  // =========== EDUCATION: Resume ===========
  {
    id: "topic-edu-001",
    vertical: "education",
    pillar: "Resume Optimization",
    topic_prompt: "The resume format that gets past ATS systems 90% of the time",
    hook_variants: [
      "Your resume never gets seen by humans. Here's how to fix that.",
      "ATS systems reject 75% of resumes. This format beats them every time.",
      "Stop using fancy resume templates. This simple format actually works.",
    ],
    claim_sensitivity: 2,
    suggested_cta: "Get the free ATS-proof template",
    motif_hints: ["resume document", "green checkmark", "ATS screen"],
    is_evergreen: true,
    seasonal_tags: ["new_year", "graduation"],
    trend_keywords: ["resume", "ATS", "job search"],
    times_used: 0,
    cooldown_days: 14,
    created_at: new Date().toISOString(),
  },
  {
    id: "topic-edu-002",
    vertical: "education",
    pillar: "Resume Optimization",
    topic_prompt: "Words that make recruiters immediately skip your resume",
    hook_variants: [
      "These 5 words are killing your resume. Stop using them today.",
      "Recruiters spend 6 seconds on your resume. These words waste all 6.",
      "I review 100 resumes a day. These words make me skip immediately.",
    ],
    claim_sensitivity: 1,
    suggested_cta: "Download the word swap guide",
    motif_hints: ["red X marks", "resume with highlights", "before/after"],
    is_evergreen: true,
    seasonal_tags: [],
    trend_keywords: ["resume words", "recruiter tips", "job hunting"],
    times_used: 0,
    cooldown_days: 10,
    created_at: new Date().toISOString(),
  },
  {
    id: "topic-edu-003",
    vertical: "education",
    pillar: "Interview Prep",
    topic_prompt: "The answer framework that works for any interview question",
    hook_variants: [
      "One framework answers 90% of interview questions. Here it is.",
      "Stop memorizing answers. Use this framework instead.",
      "I've done 500+ interviews. This is the only answer structure you need.",
    ],
    claim_sensitivity: 1,
    suggested_cta: "Get the interview cheat sheet",
    motif_hints: ["interview setting", "confident person", "notepad"],
    is_evergreen: true,
    seasonal_tags: ["graduation", "new_year"],
    trend_keywords: ["interview", "STAR method", "job interview"],
    times_used: 0,
    cooldown_days: 10,
    created_at: new Date().toISOString(),
  },
  {
    id: "topic-edu-004",
    vertical: "education",
    pillar: "Interview Prep",
    topic_prompt: "What to say when they ask 'What's your biggest weakness'",
    hook_variants: [
      "The 'weakness' question isn't about weakness. Here's what they really want.",
      "Stop saying 'I work too hard' for your weakness. Say this instead.",
      "This weakness answer got me offers at 3 different companies.",
    ],
    claim_sensitivity: 1,
    suggested_cta: "Get 10 perfect weakness answers",
    motif_hints: ["interview room", "thinking pose", "confident response"],
    is_evergreen: true,
    seasonal_tags: [],
    trend_keywords: ["interview weakness", "common questions", "job interview"],
    times_used: 0,
    cooldown_days: 7,
    created_at: new Date().toISOString(),
  },
  {
    id: "topic-edu-005",
    vertical: "education",
    pillar: "Salary Negotiation",
    topic_prompt: "The exact script to negotiate a higher starting salary",
    hook_variants: [
      "Never accept the first offer. Use this exact script to get more.",
      "I negotiated $15k more with one email. Here's what I said.",
      "They expect you to negotiate. Here's the script that works.",
    ],
    claim_sensitivity: 2,
    suggested_cta: "Get the negotiation script",
    motif_hints: ["money graphics", "handshake", "confident expression"],
    is_evergreen: true,
    seasonal_tags: [],
    trend_keywords: ["salary negotiation", "job offer", "higher pay"],
    times_used: 0,
    cooldown_days: 14,
    created_at: new Date().toISOString(),
  },
  
  // =========== HEALTH: Stroke Recovery ===========
  {
    id: "topic-health-001",
    vertical: "health",
    pillar: "Recovery Motivation",
    topic_prompt: "Small wins matter more than big goals in recovery",
    hook_variants: [
      "Recovery isn't about big milestones. It's about celebrating small wins.",
      "Today's tiny step is tomorrow's huge progress. Keep going.",
      "The stroke recovery journey is measured in moments, not miles.",
    ],
    claim_sensitivity: 1,
    suggested_cta: "Join our supportive community",
    motif_hints: ["person smiling", "gentle movement", "sunrise"],
    is_evergreen: true,
    seasonal_tags: [],
    trend_keywords: ["stroke recovery", "motivation", "healing"],
    times_used: 0,
    cooldown_days: 5,
    created_at: new Date().toISOString(),
  },
  {
    id: "topic-health-002",
    vertical: "health",
    pillar: "Caregiver Support",
    topic_prompt: "Caregiver burnout is real and you deserve support too",
    hook_variants: [
      "To every caregiver watching: your exhaustion is valid. You matter too.",
      "Caregiver burnout isn't weakness. It's a sign you're giving everything.",
      "You can't pour from an empty cup. Caregivers need care too.",
    ],
    claim_sensitivity: 1,
    suggested_cta: "Find caregiver resources",
    motif_hints: ["supportive embrace", "peaceful moment", "self-care"],
    is_evergreen: true,
    seasonal_tags: [],
    trend_keywords: ["caregiver", "burnout", "support"],
    times_used: 0,
    cooldown_days: 7,
    created_at: new Date().toISOString(),
  },
  {
    id: "topic-health-003",
    vertical: "health",
    pillar: "General Wellness",
    topic_prompt: "The importance of rest in the recovery process",
    hook_variants: [
      "Rest isn't giving up. It's how your brain heals.",
      "Sleep is when the real recovery happens. Prioritize rest.",
      "Pushing through exhaustion slows recovery. Rest is productive.",
    ],
    claim_sensitivity: 2,
    suggested_cta: "Connect with other survivors",
    motif_hints: ["peaceful sleep", "calm environment", "resting"],
    is_evergreen: true,
    seasonal_tags: [],
    trend_keywords: ["rest", "recovery", "healing"],
    times_used: 0,
    cooldown_days: 7,
    created_at: new Date().toISOString(),
  },
  {
    id: "topic-health-004",
    vertical: "health",
    pillar: "Community Stories",
    topic_prompt: "You are not alone in feeling frustrated with recovery",
    hook_variants: [
      "Frustrated with your recovery? You're not alone. Thousands feel the same.",
      "The recovery timeline isn't linear. Bad days don't erase progress.",
      "Every survivor has moments of frustration. That's normal and valid.",
    ],
    claim_sensitivity: 1,
    suggested_cta: "Share your journey with us",
    motif_hints: ["supportive community", "hands joining", "understanding"],
    is_evergreen: true,
    seasonal_tags: [],
    trend_keywords: ["stroke survivor", "community", "support"],
    times_used: 0,
    cooldown_days: 5,
    created_at: new Date().toISOString(),
  },
  {
    id: "topic-health-005",
    vertical: "health",
    pillar: "Resource Navigation",
    topic_prompt: "Questions to ask your healthcare team at your next visit",
    hook_variants: [
      "Preparing for your next doctor visit? Ask these questions.",
      "Your healthcare team wants you to ask questions. Start with these.",
      "Don't leave your appointment without asking these 3 things.",
    ],
    claim_sensitivity: 1,
    suggested_cta: "Download the question checklist",
    motif_hints: ["doctor visit", "notepad", "conversation"],
    is_evergreen: true,
    seasonal_tags: [],
    trend_keywords: ["healthcare", "doctor visit", "questions"],
    times_used: 0,
    cooldown_days: 10,
    created_at: new Date().toISOString(),
  },
];

// Helper to get config by account ID
export function getAccountConfig(accountId: string): AccountConfig | undefined {
  return ACCOUNT_CONFIGS.find(c => c.account_id === accountId);
}

// Helper to get policy by vertical
export function getContentPolicy(vertical: string): ContentPolicy | undefined {
  return CONTENT_POLICIES.find(p => p.vertical === vertical);
}

// Helper to get topics by vertical and pillar
export function getTopics(vertical?: string, pillar?: string): Topic[] {
  return TOPIC_BANK.filter(t => {
    if (vertical && t.vertical !== vertical) return false;
    if (pillar && t.pillar !== pillar) return false;
    return true;
  });
}

// Get available topics for an account (respecting cooldown)
export function getAvailableTopics(accountId: string, lastUsedTopics: Map<string, Date>): Topic[] {
  const config = getAccountConfig(accountId);
  if (!config) return [];
  
  const now = new Date();
  
  return TOPIC_BANK.filter(topic => {
    // Must match vertical
    if (topic.vertical !== config.vertical) return false;
    
    // Check cooldown
    const lastUsed = lastUsedTopics.get(topic.id);
    if (lastUsed) {
      const daysSinceUsed = (now.getTime() - lastUsed.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUsed < topic.cooldown_days) return false;
    }
    
    return true;
  });
}
