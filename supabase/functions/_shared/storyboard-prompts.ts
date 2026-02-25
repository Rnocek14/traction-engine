/**
 * Storyboard Prompts & Constants v1.0
 * 
 * Extracted from generate-storyboard to reduce bundle size.
 * Contains: type definitions, verb lists, story type guidance, system prompt.
 */

// ─── Scene Types ────────────────────────────────────────────

export type SceneRole = "hook" | "problem" | "story_a" | "reset" | "story_b" | "cta" | "atmosphere" | "establish";
export type ChangeType = "info" | "emotion" | "goal" | "stakes" | "location";
export type CutZone = "hook" | "setup" | "escalation" | "payoff" | "button";
export type CutType = "hard" | "continuity";
export type CoverageType = "face" | "body" | "back" | "wide" | "pov" | "obscured" | "none";
export type AlternateSubject = "environment" | "creature" | "object" | "abstract" | "threat";
export type ForceType = "weather" | "predator" | "time" | "pursuit" | "hazard" | "social" | "resource";

export const ROLE_TO_ZONE: Record<SceneRole, CutZone> = {
  hook: "hook",
  problem: "setup",
  story_a: "setup",
  reset: "escalation",
  story_b: "escalation",
  cta: "payoff",
  atmosphere: "payoff",
  establish: "setup",
};

export interface GeneratedScene {
  prompt: string;
  duration_target: number;
  camera_direction: string;
  role: SceneRole;
  change_type: ChangeType;
  narration_line?: string;
  onscreen_text?: string;
  is_hero_shot?: boolean;
  action_summary?: string;
  cut_type?: CutType;
  state_from?: string;
  state_to?: string;
  end_state?: string;
  beat_trigger?: string;
  beat_action?: string;
  beat_result?: string;
  coverage_type?: CoverageType;
  subject_required?: boolean;
  alternate_subject?: AlternateSubject;
  force_present?: boolean;
  force_type?: ForceType;
  escalation_delta?: 0 | 1 | 2 | 3;
  setpiece_delta?: string;
}

export interface GeneratedStoryboard {
  title: string;
  story_spine: string;
  motif_anchors: string[];
  palette_keywords: string[];
  scenes: GeneratedScene[];
  anchors: {
    character?: {
      description: string;
      wardrobe: string;
      identity_lock_tokens: string[];
    };
    environment?: {
      location: string;
      time_of_day: string;
      props: string[];
    };
    camera_language?: {
      lens: string;
      movement_style: string;
      framing_rules: string;
    };
    negative_list: string[];
  };
}

// ─── Verb Lists ─────────────────────────────────────────────

export const SOFT_WARN_VERBS = [
  "stand", "stands", "standing",
  "gaze", "gazes", "gazing",
  "look", "looks", "looking",
  "observe", "observes", "observing",
  "hesitate", "hesitates", "hesitating",
  "wonder", "wonders", "wondering",
  "feel", "feels", "feeling",
  "realize", "realizes", "realizing",
  "contemplate", "contemplates", "contemplating",
  "notice", "notices", "noticing",
  "see", "sees", "seeing",
  "watch", "watches", "watching",
  "stare", "stares", "staring",
  "hold", "holds", "holding",
  "sit", "sits", "sitting",
  "wait", "waits", "waiting",
  "pause", "pauses", "pausing",
];

export const PREFERRED_ACTION_VERBS = [
  "run", "runs", "running", "sprint", "sprints", "sprinting",
  "dodge", "dodges", "dodging", "grab", "grabs", "grabbing",
  "slam", "slams", "slamming", "leap", "leaps", "leaping",
  "stumble", "stumbles", "stumbling", "turn", "turns", "turning",
  "spin", "spins", "spinning", "rip", "rips", "ripping",
  "collide", "collides", "colliding", "dive", "dives", "diving",
  "tackle", "tackles", "tackling", "climb", "climbs", "climbing",
  "yank", "yanks", "yanking", "recoil", "recoils", "recoiling",
  "throw", "throws", "throwing", "catch", "catches", "catching",
  "push", "pushes", "pushing", "pull", "pulls", "pulling",
  "fall", "falls", "falling", "jump", "jumps", "jumping",
  "reach", "reaches", "reaching", "step", "steps", "stepping",
  "duck", "ducks", "ducking", "roll", "rolls", "rolling",
  "strike", "strikes", "striking", "block", "blocks", "blocking",
  "tear", "tears", "tearing", "smash", "smashes", "smashing",
  "swing", "swings", "swinging", "crash", "crashes", "crashing",
  "burst", "bursts", "bursting", "scramble", "scrambles", "scrambling",
  "surge", "surges", "surging", "sweep", "sweeps", "sweeping",
  "snap", "snaps", "snapping", "whip", "whips", "whipping",
  "lunge", "lunges", "lunging", "twist", "twists", "twisting",
  "slide", "slides", "sliding", "plunge", "plunges", "plunging",
  "vault", "vaults", "vaulting", "hurl", "hurls", "hurling",
  "drop", "drops", "dropping", "lift", "lifts", "lifting",
  "discover", "discovers", "discovering",
  "react", "reacts", "reacting", "respond", "responds", "responding",
];

// Legacy aliases
export const BANNED_VERBS = SOFT_WARN_VERBS;
export const REQUIRED_ACTION_VERBS = PREFERRED_ACTION_VERBS;

// ─── Story Type Guidance ────────────────────────────────────

export const STORY_TYPE_GUIDANCE: Record<string, string> = {
  short_story: `Create a narrative arc with beginning, middle, and end. 
    Focus on character continuity and emotional journey. 
    Pacing should be medium with 4-6 scenes of 5-8 seconds each.`,
  brainrot: `Fast-paced, attention-grabbing content with quick cuts.
    Each scene should be visually distinct and high-energy.
    Use 5-8 very short scenes of 3-4 seconds each.`,
  info: `Educational or informational content with clear visual demonstrations.
    Focus on clarity and visual metaphors.
    Use 3-5 scenes of 5-6 seconds each.`,
  hybrid: `Mix of narrative and informational elements.
    Balance storytelling with key information.
    Use 4-5 scenes of 5-6 seconds each.`,
};

// ─── System Prompt (legacy GPT path) ────────────────────────

export const SYSTEM_PROMPT = `You are an expert cinematographer and storyboard artist. Given a concept, create a complete video storyboard with multiple scenes.

NARRATIVE STRUCTURE (required):
- story_spine: One sentence capturing desire → tension → turn → payoff
  Example: "Person discovers creepy targeting → realizes data is being copied → maps exposure → regains control"
- motif_anchors: 2-3 recurring visual metaphors that appear across scenes
  Example: ["floating data strings", "shadow duplicate", "dissolving map pins"]
- palette_keywords: 3-5 color terms for visual consistency
  Example: ["cool blues", "warm highlights", "soft film grain"]

SCENE ROLES - Assign each scene a narrative role:
- "hook": Opening attention-grabber (2-4 seconds) - pattern interrupt, curiosity spike
- "problem": Show the pain point (4-6 seconds) - atmospheric mood, physics
- "story_a": First narrative beat (6-8 seconds) - establish the situation, cinematic
- "reset": Quick attention reset (2-3 seconds) - micro-cut, whip pan, dopamine hit
- "story_b": Payoff/reveal (6-10 seconds) - the hero moment, transformation
- "cta": Call to action (4-6 seconds) - proof, result, next step
- "atmosphere": Texture transition (3-5 seconds) - optional physics glue
- "establish": Wide establishing shot (4-6 seconds) - environment, context

CHANGE TYPE (required per scene) - What changes from the previous beat?
Every cut MUST change something meaningful (no montage drift):
- "info": New information revealed (we learn something)
- "emotion": Feeling/tone shift (face, body language, mood changes)
- "goal": What character wants changes (motivation shift)
- "stakes": Why it matters increases (tension rises)
- "location": Physical move with meaning (we move somewhere)

Choose roles based on narrative position and purpose. A typical 6-scene story uses:
hook → problem → story_a → reset → story_b → cta

═══ ACTION GUIDANCE (SOFT PREFERENCES) ═══
Every scene SHOULD contain PHYSICAL ACTION for best results.
For high-action scenes, provide 3-BEAT ACTION STRUCTURE:
1. beat_trigger: External event forcing action
2. beat_action: Physical verb the character performs
3. beat_result: Observable end-state

TRANSFORMATION-BASED DESCRIPTIONS (CRITICAL):
Each scene must describe a STATE CHANGE, not a static tableau.
Provide: action_summary, state_from, state_to, end_state, coverage_type, subject_required, force fields.

STORY FORCES: Every good story has EXTERNAL PRESSURE.
Force types: weather, predator, time, pursuit, hazard, social, resource.
Escalation delta: 0=neutral, 1=minor, 2=significant, 3=crisis.

Coverage types: face, body, back, wide, pov, obscured, none.
Spectacle scenes (subject_required=false) use alternate_subject: environment, creature, object, abstract, threat.

IMPORTANT PROMPT GUIDELINES:
- Be specific and visual - describe what the camera SEES
- Include lighting, atmosphere, and mood
- Mention camera movement and framing
- Keep each prompt focused on ONE clear action/moment
- Use cinematic language (wide shot, close-up, tracking, etc.)
- START THE PROMPT WITH ACTION

Respond ONLY with valid JSON in this exact format:
{
  "title": "Story title",
  "story_spine": "desire→tension→turn→payoff",
  "motif_anchors": ["visual motif 1", "visual motif 2"],
  "palette_keywords": ["color1", "color2", "texture"],
  "scenes": [
    {
      "prompt": "ACTION VERB FIRST: ...",
      "beat_trigger": "...",
      "beat_action": "...",
      "beat_result": "...",
      "action_summary": "...",
      "state_from": "...",
      "state_to": "...",
      "end_state": "...",
      "duration_target": 5,
      "camera_direction": "...",
      "role": "problem",
      "change_type": "stakes",
      "coverage_type": "wide",
      "subject_required": false,
      "alternate_subject": "creature",
      "force_present": true,
      "force_type": "predator",
      "escalation_delta": 2,
      "narration_line": "Optional TTS line",
      "onscreen_text": "Optional overlay"
    }
  ],
  "anchors": {
    "character": { "description": "...", "wardrobe": "...", "identity_lock_tokens": ["..."] },
    "environment": { "location": "...", "time_of_day": "golden_hour", "props": ["..."] },
    "camera_language": { "lens": "50mm", "movement_style": "smooth", "framing_rules": "..." },
    "negative_list": ["flicker", "jitter", "identity drift", "morph"]
  }
}`;
