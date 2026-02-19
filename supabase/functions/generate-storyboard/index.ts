/**
 * generate-storyboard
 * 
 * Uses GPT-4o to generate a complete multi-scene storyboard
 * from a simple concept or description.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateRequest {
  concept: string;
  story_type?: "short_story" | "brainrot" | "info" | "hybrid";
  scene_count?: number;
  /** Template-mode engine config — when present, skips legacy GPT storyboard */
  story_engine?: {
    vertical: string;
    goal: string;
    emotional_intensity?: string;
    requested_story_type?: string;
    research_mode?: "auto" | "on" | "off";
  };
  /** Override generator path: "legacy" (default) | "template" */
  generator_mode?: "legacy" | "template";
  tier?: "volume" | "hero";
  brutality_mode?: boolean;
  sanitization_level?: string;
  character_continuity_mode?: boolean;
  locked_provider?: string;
}

type SceneRole = "hook" | "problem" | "story_a" | "reset" | "story_b" | "cta" | "atmosphere" | "establish";
type ChangeType = "info" | "emotion" | "goal" | "stakes" | "location";
type CutZone = "hook" | "setup" | "escalation" | "payoff" | "button";

// Role-to-zone mapping for computed zones
const ROLE_TO_ZONE: Record<SceneRole, CutZone> = {
  hook: "hook",
  problem: "setup",
  story_a: "setup",
  reset: "escalation",
  story_b: "escalation",
  cta: "payoff",
  atmosphere: "payoff",
  establish: "setup",
};

type CutType = "hard" | "continuity";

// Coverage type for action vs identity trade-off
type CoverageType = "face" | "body" | "back" | "wide" | "pov" | "obscured" | "none";

// Spectacle scene alternate subjects (when protagonist not required)
type AlternateSubject = "environment" | "creature" | "object" | "abstract" | "threat";

// Story Forces - external pressures acting on the protagonist
type ForceType = "weather" | "predator" | "time" | "pursuit" | "hazard" | "social" | "resource";

interface GeneratedScene {
  prompt: string;
  duration_target: number;
  camera_direction: string;
  role: SceneRole;
  // Director Brain fields (Phase 1)
  change_type: ChangeType;
  narration_line?: string;
  onscreen_text?: string;
  is_hero_shot?: boolean;
  // Phase 2: Explicit action summary for progression injection
  action_summary?: string;
  // Phase 3: Cut type for I2V vs T2V decision
  cut_type?: CutType;
  // Phase 4: Transformation fields for narrative continuity
  state_from?: string;
  state_to?: string;
  end_state?: string;
  // Phase 5: 3-Beat Action Schema
  beat_trigger?: string;
  beat_action?: string;
  beat_result?: string;
  // Phase 6: Coverage type for action vs identity
  coverage_type?: CoverageType;
  // Phase 7: Spectacle scene system (subject freedom)
  subject_required?: boolean;
  alternate_subject?: AlternateSubject;
  // Phase 8: Story Forces (external pressure/escalation)
  force_present?: boolean;           // Is an external force acting in this scene?
  force_type?: ForceType;            // What kind of force?
  escalation_delta?: 0 | 1 | 2 | 3;  // How much worse than previous? 0=neutral, 3=crisis
  setpiece_delta?: string;           // What changed in environment/state (e.g., "surface→tunnel")
}

interface GeneratedStoryboard {
  title: string;
  // Director Brain fields (Phase 1)
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

// === ACTION VERB PREFERENCES (SOFT SCORING, NOT HARD REJECTION) ===
// These verbs tend to create "static tableaux" - Sora interprets them as "hold this pose"
// SOFT MODE: We warn about these but don't reject - atmospheric beats need breathing room
const SOFT_WARN_VERBS = [
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

// These verbs ENCOURAGE physical action - prefer at least one in first 20 words
// SOFT MODE: Score bonus for including these, not a hard requirement
const PREFERRED_ACTION_VERBS = [
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
  "discover", "discovers", "discovering", // allowed: active reveal
  "react", "reacts", "reacting", "respond", "responds", "responding",
];

// Legacy exports for backwards compatibility
const BANNED_VERBS = SOFT_WARN_VERBS;
const REQUIRED_ACTION_VERBS = PREFERRED_ACTION_VERBS;

const STORY_TYPE_GUIDANCE: Record<string, string> = {
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

const SYSTEM_PROMPT = `You are an expert cinematographer and storyboard artist. Given a concept, create a complete video storyboard with multiple scenes.

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

═══════════════════════════════════════════════════════════════════════════════
🎬 ACTION GUIDANCE (SOFT PREFERENCES, NOT HARD RULES)
═══════════════════════════════════════════════════════════════════════════════

Every scene SHOULD contain PHYSICAL ACTION for best results.
However, atmospheric and contemplative beats ARE ALLOWED when narratively justified.

For high-action scenes, you SHOULD provide a 3-BEAT ACTION STRUCTURE:
1. beat_trigger: "What external event forces action" (storm hits, door opens, branch snaps)
2. beat_action: "Physical verb the character performs" (dives, grabs, sprints, leaps)
3. beat_result: "Observable end-state" (lands behind rock, holds object, enters new space)

SOFT WARNINGS (these CAN work but often produce static output):
stand, gaze, look, observe, hesitate, wonder, feel, realize,
contemplate, notice, see, watch, stare, hold, sit, wait, pause

PREFERRED ACTION VERBS (use these for dynamic scenes):
run, sprint, dodge, grab, slam, leap, stumble, turn, spin, rip, collide, dive,
tackle, climb, yank, recoil, throw, catch, push, pull, fall, jump, reach, step,
duck, roll, strike, block, tear, smash, swing, crash, burst, scramble, surge,
sweep, snap, whip, lunge, twist, slide, plunge, vault, hurl, drop, lift

NOTE: Atmospheric beats (character gazes at horizon) ARE VALID for pacing.
The goal is DYNAMIC STORIES, not constant action. Use soft verbs intentionally.

Example of GOOD scene:
prompt: "The Martian DIVES for cover as the dust storm CRASHES over the ridge, scrambling on hands and knees toward a rock formation"
beat_trigger: "dust storm crashes over ridge"
beat_action: "dives, scrambles"
beat_result: "reaches shelter behind rock formation"

Example of BAD scene (will be rejected):
prompt: "The Martian stands gazing at the approaching storm, hesitating"
← REJECTED: "stands, gazes, hesitating" are BANNED VERBS

═══════════════════════════════════════════════════════════════════════════════

TRANSFORMATION-BASED DESCRIPTIONS (CRITICAL):
Each scene must describe a STATE CHANGE, not a static tableau.

For each scene, provide:
1. A detailed visual prompt (what's happening, composition, lighting, mood)
   - THE FIRST 20 WORDS MUST CONTAIN A REQUIRED ACTION VERB
2. beat_trigger: External event that forces action
3. beat_action: Physical verb(s) from the REQUIRED list
4. beat_result: Observable end-state
5. action_summary: STATE CHANGE description in format "[Subject] [transformation verb] from [state A] to [state B]"
   ✓ Good: "Cat's posture shifts from defensive to curious as ears rotate forward"
   ✓ Good: "Dog's expression changes from eager to submissive, rolling over"
   ✗ Bad: "Cat looks hesitant" (static state, no transformation)
6. state_from: 3-6 words describing starting state (posture, expression, position)
7. state_to: 3-6 words describing ending state (must be DIFFERENT from state_from)
8. end_state: 1 sentence describing what should be TRUE at the end of this clip
9. Suggested duration (match the role's recommended range)
10. Camera direction (movement, framing, lens suggestion)
11. Role assignment from the list above
12. change_type: What changes at this beat
13. narration_line (optional): TTS voiceover line for this beat
14. onscreen_text (optional): Text overlay if needed
15. coverage_type: Camera coverage for action vs identity trade-off (CRITICAL)
16. subject_required: Does the protagonist need to appear in this scene? (CRITICAL)
17. alternate_subject: If subject_required=false, what's the focus? (environment/creature/object/abstract/threat)
18. force_present: Is an external FORCE acting in this scene? (CRITICAL FOR TENSION)
19. force_type: Type of force if present (weather/predator/time/pursuit/hazard/social/resource)
20. escalation_delta: How much worse than previous? (0=neutral, 1=minor, 2=significant, 3=crisis)

═══════════════════════════════════════════════════════════════════════════════
🎯 STORY FORCES (CRITICAL FOR TENSION!)
═══════════════════════════════════════════════════════════════════════════════

Every good story has EXTERNAL PRESSURE acting on the protagonist.
Without forces, you get activity sequences, not stories.

FORCE TYPES:
- "weather": Rain, storm, flood, cold, heat (environment threatens)
- "predator": Spider, bird, mantis, enemy (something hunts/attacks)
- "time": Deadline, countdown, closing window (urgency)
- "pursuit": Being chased, followed, tracked (escape pressure)
- "hazard": Falling debris, fire, collapse, trap (danger)
- "social": Crowd, rejection, rivals (interpersonal pressure)
- "resource": Running out of food, air, energy (depletion)

ESCALATION DELTA (each scene):
- 0: Neutral beat (setup, breathing room, transition)
- 1: Minor escalation (tension rises slightly)
- 2: Significant escalation (things get notably worse)  
- 3: Crisis point (maximum tension, something must break)

ESCALATION CONTRACT (MUST meet these minimums):
- At least 2 scenes with force_present=true
- At least 3 scenes with escalation_delta >= 2
- At least 2 distinct setpiece_deltas (location/state transitions)
- Scenes 3-5 should typically have the highest escalation

═══════════════════════════════════════════════════════════════════════════════
📷 COVERAGE TYPE (CRITICAL FOR ACTION SCENES)
═══════════════════════════════════════════════════════════════════════════════

Every scene must specify camera coverage that balances action vs identity.
This determines whether we can go "crazy" with motion or must preserve faces.

coverage_type options:
- "face": Closeup, emotional beat. Identity critical. Use for: reactions, reveals, CTA
- "body": Full-body action. Face visible but secondary. Use for: running, fighting, gesturing
- "back": Back-turned or silhouette. Face not visible. Use for: sprinting away, dramatic reveals
- "wide": Environment-dominant, figure small. Use for: establishing, chase across landscape
- "pov": First-person, helmet cam, visor view. Use for: diving, falling, subjective action
- "obscured": Face hidden by dust/rain/blur/darkness. Use for: storm scenes, dramatic tension
- "none": Pure spectacle, abstract, environment-only. No character needed. Use for: portals, explosions, cosmic

═══════════════════════════════════════════════════════════════════════════════
🎭 SPECTACLE SCENE SYSTEM (CRITICAL FOR ACTION VARIETY)
═══════════════════════════════════════════════════════════════════════════════

NOT EVERY SCENE NEEDS THE PROTAGONIST! This is how action films work.
Use "spectacle scenes" for cross-cutting, insert shots, and world-building.

For each scene, specify:
- subject_required: true (protagonist must appear) OR false (pure spectacle)
- alternate_subject (only if subject_required=false): 
  "environment" | "creature" | "object" | "abstract" | "threat"

═══════════════════════════════════════════════════════════════════════════════
⚠️ SPECTACLE = PLOT ENGINE, NOT SCENERY (CRITICAL!)
═══════════════════════════════════════════════════════════════════════════════

Spectacle scenes are NOT pretty backgrounds! They are ACTIVE PLOT BEATS.
Every spectacle scene MUST be one of these categories:

1. THREAT REVEAL: Antagonist appears, escalates, attacks
   ✓ "Dragon DESCENDS through clouds, jaws OPEN in attack posture"
   ✗ "Dragon flies in the distance" (passive, boring)

2. CAUSE EVENT: Explosion, portal opens, storm wall hits, invasion begins
   ✓ "Portal TEARS through reality, debris SPIRALING into the void"
   ✗ "Portal glows softly in the forest" (static, no action)

3. INSERT CLUE: Artifact activates, radar spikes, warning lights, map reveals doom
   ✓ "Radar screen ERUPTS with contacts, warning klaxon BLARES"
   ✗ "Radar shows something on the screen" (vague, no urgency)

4. CROSS-CUT ESCALATION: War intensifies, dragon closes in, portal destabilizes
   ✓ "Battlefield EXPLODES with cavalry charge, siege towers TOPPLE"
   ✗ "Wide shot of the battle" (description, not action)

SPECTACLE SCENE ENFORCEMENT:
- MUST include one physical action verb (same rules as hero scenes!)
- MUST include one impact outcome (what changes by the end)
- Environment is allowed BUT IT MUST BE ACTIVE (storm SLAMS, ground CRACKS)
- Passive environment shots will be REJECTED

ALTERNATE_SUBJECT BIAS (CRITICAL FOR ACTION):
When choosing alternate_subject for spectacle scenes, use this priority:
- "threat" (50%): Dragon, enemy, monster, danger, attack - MOST COMMON
- "environment" with CAUSE EVENT (25%): Storm HITS, ground CRACKS, structure COLLAPSES
- "creature" (15%): Animal, beast, monster moving/attacking
- "object" (5%): Artifact activating, portal opening
- "abstract" (5%): Cosmic, surreal (rare, only for transitions)

⚠️ DO NOT default to "environment" for passive scenery! 
If the scene is "spectacle," it needs an ACTIVE THREAT or CAUSE EVENT.
"environment" alone = boring. "threat" = action.

RECOMMENDED 6-SCENE PATTERN (3 hero / 3 spectacle with CROSS-CUT RHYTHM):
Scene 0 (hook): subject_required=FALSE, alternate_subject="threat" or "environment"
  → CAUSE EVENT: "What triggers the story? Show it exploding/appearing/attacking"
Scene 1 (problem): subject_required=FALSE, alternate_subject="threat"
  → THREAT REVEAL: "Show the DANGER, not the hero's reaction"
Scene 2 (story_a): subject_required=TRUE
  → HERO REACTS: First protagonist action (escape, engage, respond)
Scene 3 (reset): subject_required=FALSE, alternate_subject="threat" or "creature"
  → ESCALATION: "Threat gets WORSE while hero is away" (cross-cut tension)
Scene 4 (story_b): subject_required=TRUE
  → HERO PAYOFF: Protagonist's counter-move or transformation
Scene 5 (cta): subject_required=TRUE, coverage_type="face"
  → EMOTIONAL LANDING: Face reveal, resolution, determination

This creates CROSS-CUT RHYTHM: Threat → Hero → Threat → Hero → Hero
That's what makes action films feel exciting!

SPECTACLE SCENE RULES:
- When subject_required=false: coverage_type MUST be "wide", "pov", "obscured", or "none"
- When subject_required=false: prompt should NOT mention the protagonist AT ALL
- When subject_required=false: focus 100% on the alternate_subject (threat, environment, etc.)
- When subject_required=false: describe what the THREAT/ENVIRONMENT does, not how characters react

EXAMPLE - "Medieval War with Dragons" (why it worked):
Scene 0: subject_required=false, alternate_subject="environment" → "Siege towers CRASH against walls, flames ERUPT"
Scene 1: subject_required=false, alternate_subject="threat" → "Dragon DESCENDS through clouds, wings SPREAD, fire BUILDING"
Scene 2: subject_required=true → "Knight SPRINTS across battlefield, DODGING falling debris"
Scene 3: subject_required=false, alternate_subject="creature" → "Dragon BANKS hard, fire ERUPTS across infantry lines"
Scene 4: subject_required=true → "Knight DIVES for cover as flames ROAR overhead, shield RAISED"
Scene 5: subject_required=true, coverage_type="face" → "Knight's visor OPENS, ash FALLING, expression HARDENS"

↑ This pattern gives you WILD ACTION (3 spectacle) + EMOTIONAL PAYOFF (3 hero).

CRITICAL RULES FOR NARRATIVE GLUE:
- The prompt's FIRST CLAUSE must contain an action verb (not buried later)
- beat_action must be a physical verb (shifts, changes, transforms, moves, turns, reacts, responds, realizes, decides)
- state_from and state_to must be DIFFERENT (if they're the same, the scene is static)
- end_state describes the OBSERVABLE RESULT that the next scene will react to
- Each scene must RESPOND to the previous scene's end_state (cause → effect)
- SPECTACLE SCENES: Must also have action verbs and impact outcomes - they are NOT exempt!

Also extract continuity anchors:
- Character details (if any characters appear)
- Environment/location consistency
- Camera language (preferred lens, movement style)
- Negative list (artifacts to avoid)

IMPORTANT PROMPT GUIDELINES:
- Be specific and visual - describe what the camera SEES
- Include lighting, atmosphere, and mood
- Mention camera movement and framing
- Keep each prompt focused on ONE clear action/moment
- Avoid abstract concepts - make it concrete and filmable
- Use cinematic language (wide shot, close-up, tracking, etc.)
- For HOOK/RESET scenes: Start with camera motion (e.g., "Whip pan:", "Tracking shot:")
- For STORY scenes: Use full cinematic description
- Reference motif_anchors in scene prompts for visual continuity
- START THE PROMPT WITH ACTION - don't bury the verb
- For SPECTACLE SCENES: Focus entirely on the alternate_subject doing something ACTIVE, no protagonist reference

Respond ONLY with valid JSON in this exact format:
{
  "title": "Story title",
  "story_spine": "Person discovers X → tries Y → realizes Z → resolves with W",
  "motif_anchors": ["visual metaphor 1", "visual metaphor 2"],
  "palette_keywords": ["color 1", "color 2", "texture"],
  "scenes": [
    {
      "prompt": "ACTION VERB FIRST: Dragon DESCENDS through storm clouds...",
      "beat_trigger": "storm intensifies",
      "beat_action": "descends, spreads wings",
      "beat_result": "dominates the sky",
      "action_summary": "Dragon emerges from clouds, wings spread in threat display",
      "state_from": "hidden in clouds",
      "state_to": "fully visible, wings spread",
      "end_state": "Dragon dominates the sky, threat established",
      "duration_target": 5,
      "camera_direction": "Low angle looking up, dramatic lighting",
      "role": "problem",
      "change_type": "stakes",
      "coverage_type": "wide",
      "subject_required": false,
      "alternate_subject": "creature",
      "force_present": true,
      "force_type": "predator",
      "escalation_delta": 2,
      "narration_line": "Optional TTS line for this beat",
      "onscreen_text": "Optional text overlay"
    },
    {
      "prompt": "ACTION VERB FIRST: Knight SPRINTS across battlefield...",
      "beat_trigger": "dragon spotted",
      "beat_action": "sprints, dodges",
      "beat_result": "reaches cover",
      "action_summary": "Knight reacts to dragon threat with desperate sprint",
      "state_from": "exposed on battlefield",
      "state_to": "diving toward cover",
      "end_state": "Knight in motion, actively evading",
      "duration_target": 5,
      "camera_direction": "Tracking shot following knight",
      "role": "story_a",
      "change_type": "goal",
      "coverage_type": "back",
      "subject_required": true,
      "force_present": true,
      "force_type": "pursuit",
      "escalation_delta": 3,
      "narration_line": "Optional TTS line",
      "onscreen_text": "Optional overlay"
    }
  ],
  "anchors": {
    "character": {
      "description": "Physical description or empty string if no character",
      "wardrobe": "Clothing details or empty string",
      "identity_lock_tokens": ["distinctive", "features"]
    },
    "environment": {
      "location": "Setting description",
      "time_of_day": "golden_hour",
      "props": ["key", "props"]
    },
    "camera_language": {
      "lens": "50mm",
      "movement_style": "smooth",
      "framing_rules": "Framing guidance"
    },
    "negative_list": ["flicker", "jitter", "identity drift", "morph"]
  }
}`;
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const body = await req.json() as GenerateRequest;
    const { concept, story_type = "short_story", scene_count } = body;
    const tier = body.tier || "volume";

    // ═══════════════════════════════════════════════════════════
    // TEMPLATE MODE: story_engine provided → use routeStory() pipeline
    // ═══════════════════════════════════════════════════════════
    const useTemplateMode = !!(body.story_engine?.vertical && body.story_engine?.goal) || body.generator_mode === "template";

    if (useTemplateMode && body.story_engine) {
      const { routeStory, preflightValidate } = await import("../_shared/story-type-router.ts");
      const viralMod = await import("../_shared/viral-compiler.ts");
      const compileViralPrompt = viralMod.compileViralPrompt;
      const { sanitizePromptText, selectWeightedHookCategory, getVerticalCTA, sanitizeStory } = await import("../_shared/prompt-compliance.ts");
      const { buildStoryEngineAudit, seededRng } = await import("../_shared/story-engine-audit.ts");
      const { buildResearchBrief, buildClaimConstraintBlock, checkClaimCoverage } = await import("../_shared/research-engine.ts");

      const vertical = body.story_engine.vertical as ContentVertical;
      const goal = body.story_engine.goal as ContentGoal;
      const emotional_intensity = body.story_engine.emotional_intensity as EmotionalIntensity | undefined;
      const requested_story_type = body.story_engine.requested_story_type as StoryType | undefined;
      const researchMode = body.story_engine.research_mode || "auto";

      console.log(`[generate-storyboard] Template mode: vertical=${vertical} goal=${goal} intensity=${emotional_intensity || "unset"} research=${researchMode}`);

      // 1. Route story → get constraints + selection
      const { constraints, selection } = routeStory({
        vertical,
        goal,
        emotional_intensity,
        forced_type: requested_story_type,
      });

      const template = constraints.template;
      console.log(`[generate-storyboard] Resolved: type=${selection.type} compiler=${constraints.compiler} beats=${template.beats.length}`);

      // 1b. Research step — runs BEFORE beat generation
      const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY") || "";
      const researchBrief = await buildResearchBrief({
        concept,
        vertical,
        perplexityKey,
        mode: researchMode as "auto" | "on" | "off",
      });

      if (researchBrief.activated) {
        console.log(`[generate-storyboard] Research: grounded=${researchBrief.grounded} claims=${researchBrief.claims.length} sources=${researchBrief.sources.length}`);
        if (researchMode === "on" && !researchBrief.grounded) {
          // Hard fail: user explicitly requested research but retrieval failed
          return new Response(
            JSON.stringify({
              error: `Research mode is "on" but retrieval failed: ${researchBrief.failure_reason || "unknown error"}. Set research_mode to "auto" or "off" to proceed without research.`,
              research_failure: true,
            }),
            { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Build claim constraint block for GPT prompt (empty string if no research)
      const claimConstraints = buildClaimConstraintBlock(researchBrief, vertical);

      // 2. Seeded RNG for deterministic hook/CTA selection
      const tempId = crypto.randomUUID();
      const rng = seededRng(tempId);

      // 3. Select hook category + CTA deterministically
      const hookCategory = selectWeightedHookCategory(
        vertical,
        constraints.allowed_hook_categories.map(String),
        rng
      );
      const ctaResult = getVerticalCTA(vertical, rng);
      console.log(`[generate-storyboard] Hook category: ${hookCategory}, CTA: "${ctaResult.phrase}"`);

      // 4. For viral mode: compile prompts from template beats
      //    For cinematic (myth): fall through to legacy GPT
      if (constraints.compiler === "cinematic") {
        console.log(`[generate-storyboard] Cinematic compiler → falling through to legacy GPT`);
        // Fall through to legacy path below
      } else {
        // ── VIRAL TEMPLATE PIPELINE ──

        // Use a lightweight GPT call to generate scene content per beat
        const beatPrompts = template.beats.map((beat, i) => {
          const isHook = beat.is_hook;
          const isCTA = beat.role.includes("cta") || beat.role === "proof_cta" || beat.role === "value_cta" || beat.role === "how_cta" || beat.role === "credibility_cta" || beat.role === "item_3_cta";
          return `Beat ${i + 1} (${beat.role}): ${beat.description}${isHook ? ` [hook_category: ${hookCategory}]` : ""}${isCTA ? ` [CTA: "${ctaResult.phrase}"]` : ""}`;
        });

        const templatePrompt = `You are a viral content strategist. Given a concept and beat structure, generate scene content.

CONCEPT: "${concept}"
STORY TYPE: ${selection.type} (${template.name})
VERTICAL: ${vertical}
TONE: ${constraints.allowed_tones.join(", ")}
${claimConstraints}
BEAT STRUCTURE (generate content for each):
${beatPrompts.join("\n")}

For each beat, return:
- subject: Who/what is on screen (e.g., "A fitness coach", "A supplement bottle")
- action: What they DO physically (use action verbs: grabs, slams, points, reveals)
- environment: Where (e.g., "modern kitchen, morning light")
- mood: Single word (energetic, calm, shocking, determined)
- text_overlay: Short text for on-screen overlay (if beat requires it)
- narration_line: Optional TTS voiceover line
${researchBrief.activated && researchBrief.grounded ? '- claim_ids: Array of claim IDs this beat references (e.g., ["claim_001"])' : ""}

IMPORTANT: Subject must be concrete and visual. Action must be PHYSICAL, not emotional.

Return ONLY valid JSON array:
[
  { "subject": "...", "action": "...", "environment": "...", "mood": "...", "text_overlay": "...", "narration_line": "..."${researchBrief.activated && researchBrief.grounded ? ', "claim_ids": [...]' : ""} }
]`;

        const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "Return only valid JSON arrays. No markdown, no explanation." },
              { role: "user", content: templatePrompt },
            ],
            temperature: 0.7,
            max_tokens: 1200,
          }),
        });

        if (!gptResponse.ok) {
          throw new Error(`OpenAI API error: ${gptResponse.status}`);
        }

        const gptData = await gptResponse.json();
        const gptContent = gptData.choices?.[0]?.message?.content || "";
        const jsonMatch = gptContent.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          throw new Error("Failed to parse template scene content from GPT");
        }

        const sceneContents: Array<{
          subject: string;
          action: string;
          environment?: string;
          mood?: string;
          text_overlay?: string;
          narration_line?: string;
          claim_ids?: string[];
        }> = JSON.parse(jsonMatch[0]);

        // 5. Compile each scene through viral compiler
        const storyboardId = crypto.randomUUID();
        const compiledScenes = template.beats.map((beat, i) => {
          const content = sceneContents[i] || { subject: "A person", action: "interacts with the scene" };

          const sceneInput: viralMod.ViralSceneInput = {
            scene_id: `scene_${storyboardId}_${i}`,
            beat_index: i,
            beat,
            subject: content.subject,
            action: content.action,
            environment: content.environment,
            mood: content.mood,
            text_overlay: content.text_overlay,
            hook_category: beat.is_hook ? hookCategory : undefined,
          };

          const compiled = compileViralPrompt(sceneInput, constraints);

          // Run compliance on compiled prompt
          const compliance = sanitizePromptText(compiled.prompt, vertical);
          const finalPrompt = compliance.text;

          // Hard-block check
          if (compliance.hard_blocks.length > 0 && constraints.moderation_level === "strict") {
            console.error(`[generate-storyboard] Hard block in scene ${i}: ${compliance.hard_blocks.join("; ")}`);
          }

          return {
            id: `scene_${storyboardId}_${i}`,
            prompt: finalPrompt,
            duration_target: compiled.duration_target,
            camera_direction: compiled.camera_suggestion,
            role: beat.role as SceneRole,
            beat_role: beat.role,
            beat_index: i,
            change_type: (i === 0 ? "info" : "emotion") as ChangeType,
            narration_line: content.narration_line,
            onscreen_text: content.text_overlay,
            claim_ids: content.claim_ids || [],
            sequence_index: i,
            zone: (beat.is_hook ? "hook" : beat.role.includes("cta") ? "payoff" : "setup") as CutZone,
            cut_type: (i === 0 || beat.is_hook ? "hard" : "continuity") as CutType,
            camera_lead_source: compiled.camera_lead_source,
            compliance_modified: compliance.was_modified || undefined,
          };
        });

        // 6. Preflight validation
        const preflight = preflightValidate(constraints, {
          scenes: compiledScenes.map(s => ({
            id: s.id,
            prompt: s.prompt,
            duration_target: s.duration_target,
            beat_index: s.beat_index,
            beat_role: s.beat_role,
          })),
        });

        if (!preflight.valid) {
          console.error(`[generate-storyboard] Preflight errors: ${preflight.errors.join("; ")}`);
        }
        if (preflight.warnings.length > 0) {
          console.warn(`[generate-storyboard] Preflight warnings: ${preflight.warnings.join("; ")}`);
        }

        // 6b. Claim coverage preflight (when research is active)
        let claimCoverage = undefined;
        if (researchBrief.activated && researchBrief.grounded && researchBrief.claims.length > 0) {
          claimCoverage = checkClaimCoverage(compiledScenes, researchBrief, vertical);
          if (claimCoverage.errors.length > 0) {
            console.error(`[generate-storyboard] Claim coverage errors: ${claimCoverage.errors.join("; ")}`);
            preflight.warnings.push(...claimCoverage.warnings);
            preflight.errors.push(...claimCoverage.errors);
            preflight.valid = preflight.valid && claimCoverage.errors.length === 0;
          }
          if (claimCoverage.warnings.length > 0) {
            console.warn(`[generate-storyboard] Claim coverage warnings: ${claimCoverage.warnings.join("; ")}`);
          }
          console.log(`[generate-storyboard] Claim coverage: ${claimCoverage.coverage_pct}% (${claimCoverage.beats_with_claims}/${claimCoverage.total_beats} beats)`);
        }

        // 7. Run compliance on all scenes at once for summary
        const storyCompliance = sanitizeStory(
          compiledScenes.map(s => ({ scene_id: s.id, prompt: s.prompt })),
          vertical
        );

        // 8. Build canonical audit (with research brief)
        const audit = buildStoryEngineAudit({
          vertical,
          goal,
          emotional_intensity,
          requested_story_type: requested_story_type,
          resolved_story_type: selection.type,
          selection_reason: selection.reason,
          effective_intensity: selection.effective_intensity,
          compiler: constraints.compiler,
          moderation_level: constraints.moderation_level,
          allowed_tones: constraints.allowed_tones.map(String),
          allowed_hook_categories: constraints.allowed_hook_categories.map(String),
          render_hints: constraints.vertical_profile.render_hints,
          preflight,
          compliance: {
            disclaimer: storyCompliance.disclaimer,
            total_replacements: storyCompliance.total_replacements,
            has_hard_blocks: storyCompliance.has_hard_blocks,
          },
          rng_seed: tempId,
          research: researchBrief.activated ? researchBrief : undefined,
        });

        // 9. Generate title/spine/palette via tiny GPT call
        const metaResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "Return only valid JSON. No markdown." },
              { role: "user", content: `Given concept "${concept}" for a ${selection.type} video, return:\n{"title":"short catchy title","story_spine":"desire→tension→turn→payoff in 1 sentence","motif_anchors":["visual motif 1","visual motif 2"],"palette_keywords":["color1","color2","texture"]}` },
            ],
            temperature: 0.5,
            max_tokens: 200,
          }),
        });

        let meta = { title: concept.slice(0, 50), story_spine: "", motif_anchors: [] as string[], palette_keywords: [] as string[] };
        if (metaResponse.ok) {
          try {
            const metaData = await metaResponse.json();
            const metaContent = metaData.choices?.[0]?.message?.content || "";
            const metaJson = metaContent.match(/\{[\s\S]*\}/);
            if (metaJson) meta = { ...meta, ...JSON.parse(metaJson[0]) };
          } catch { /* use defaults */ }
        }

        // 10. Return same response shape as legacy
        console.log(`[generate-storyboard] ✓ Template mode complete: ${compiledScenes.length} scenes, type=${selection.type}`);

        return new Response(
          JSON.stringify({
            title: meta.title,
            story_spine: meta.story_spine,
            motif_anchors: meta.motif_anchors,
            palette_keywords: meta.palette_keywords,
            scenes: compiledScenes,
            anchors: {
              character: { description: "", wardrobe: "", identity_lock_tokens: [] },
              environment: { location: "", time_of_day: "", props: [] },
              camera_language: { lens: "50mm", movement_style: "smooth", framing_rules: "" },
              negative_list: ["flicker", "jitter", "identity drift", "morph"],
            },
            tier,
            // Template-mode bonus fields (consumed by wizard)
            generator_mode: "template",
            resolved_story_type: selection.type,
            selection_reason: selection.reason,
            effective_intensity: selection.effective_intensity,
            compiler: constraints.compiler,
            moderation_level: constraints.moderation_level,
            allowed_tones: constraints.allowed_tones,
            allowed_hook_categories: constraints.allowed_hook_categories,
            hook_category: hookCategory,
            cta_phrase: ctaResult.phrase,
            preflight,
            compliance: {
              disclaimer: storyCompliance.disclaimer,
              total_replacements: storyCompliance.total_replacements,
              has_hard_blocks: storyCompliance.has_hard_blocks,
            },
            story_engine_audit: audit,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ═══════════════════════════════════════════════════════════
    // LEGACY MODE: GPT-4o freeform storyboard generation
    // ═══════════════════════════════════════════════════════════
    console.log(`[generate-storyboard] Legacy mode: concept="${concept.slice(0, 60)}..." type=${story_type}`);

    if (!concept?.trim()) {
      return new Response(
        JSON.stringify({ error: "concept required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const typeGuidance = STORY_TYPE_GUIDANCE[story_type] || STORY_TYPE_GUIDANCE.short_story;
    const sceneGuidance = scene_count ? `Create exactly ${scene_count} scenes.` : "";

    const userPrompt = `Create a storyboard for this concept:

"${concept}"

Story Type: ${story_type}
${typeGuidance}
${sceneGuidance}

Generate a complete, filmable storyboard with vivid, specific visual prompts for each scene.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    let storyboard: GeneratedStoryboard;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      storyboard = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse storyboard response");
    }

    // === ACTION VERB VALIDATION ===
    // Check each scene for banned verbs and require action verbs early
    const validationResults = storyboard.scenes.map((scene, i) => {
      const promptLower = scene.prompt.toLowerCase();
      const first20Words = promptLower.split(/\s+/).slice(0, 20).join(" ");
      
      // Check for banned verbs in first clause (before first comma or period)
      const firstClause = promptLower.split(/[,.:!?]/)[0] || "";
      const bannedVerbFound = BANNED_VERBS.find(verb => {
        const regex = new RegExp(`\\b${verb}\\b`, "i");
        return regex.test(firstClause);
      });
      
      // Check for required action verb in first 20 words
      const hasActionVerb = REQUIRED_ACTION_VERBS.some(verb => {
        const regex = new RegExp(`\\b${verb}\\b`, "i");
        return regex.test(first20Words);
      });
      
      // Check for 3-beat schema
      const hasBeats = !!(scene.beat_trigger && scene.beat_action && scene.beat_result);
      
      return {
        sceneIndex: i,
        bannedVerb: bannedVerbFound,
        hasActionVerb,
        hasBeats,
        valid: !bannedVerbFound && hasActionVerb,
      };
    });
    
    const invalidScenes = validationResults.filter(r => !r.valid);
    if (invalidScenes.length > 0) {
      console.warn(`[generate-storyboard] Validation warnings for ${invalidScenes.length} scenes:`);
      invalidScenes.forEach(s => {
      console.warn(`  Scene ${s.sceneIndex + 1}: ${
          s.bannedVerb ? `banned verb "${s.bannedVerb}"` : ""
        } ${!s.hasActionVerb ? "missing action verb in first 20 words" : ""}`);
      });
      // Log but don't fail - GPT sometimes still produces good content
      // Future: could retry with stronger prompt injection here
    }
    
    // === SPECTACLE BUDGET VALIDATION ===
    // Enforce cross-cut rhythm: 2-4 spectacle, 2-4 hero, 1-2 face max
    const spectacleCount = storyboard.scenes.filter(s => s.subject_required === false).length;
    const heroCount = storyboard.scenes.filter(s => s.subject_required !== false).length;
    const faceCount = storyboard.scenes.filter(s => s.coverage_type === "face").length;
    
    // Calculate valid ranges based on scene count
    const minSpectacle = Math.max(1, Math.floor(storyboard.scenes.length * 0.25)); // At least 25%
    const maxSpectacle = Math.ceil(storyboard.scenes.length * 0.6); // At most 60%
    const maxFace = Math.max(2, Math.ceil(storyboard.scenes.length * 0.35)); // At most 35%
    
    let budgetWarnings: string[] = [];
    if (spectacleCount < minSpectacle) {
      budgetWarnings.push(`spectacle_count=${spectacleCount} < min=${minSpectacle} (story may feel flat)`);
    }
    if (spectacleCount > maxSpectacle) {
      budgetWarnings.push(`spectacle_count=${spectacleCount} > max=${maxSpectacle} (story loses emotional anchor)`);
    }
    if (faceCount > maxFace) {
      budgetWarnings.push(`face_count=${faceCount} > max=${maxFace} (too much I2V, kills action freedom)`);
    }
    
    if (budgetWarnings.length > 0) {
      console.warn(`[generate-storyboard] Spectacle budget warnings:`);
      budgetWarnings.forEach(w => console.warn(`  ⚠️ ${w}`));
    } else {
      console.log(`[generate-storyboard] ✓ Spectacle budget OK: spectacle=${spectacleCount}, hero=${heroCount}, face=${faceCount}`);
    }
    
    // === STORY FORCES VALIDATION (Escalation Contract) ===
    // FIX: Clamp escalation_delta to 0-3 range before validation
    for (const scene of storyboard.scenes) {
      if (typeof scene.escalation_delta === 'number') {
        scene.escalation_delta = Math.max(0, Math.min(3, Math.floor(scene.escalation_delta))) as 0 | 1 | 2 | 3;
      }
    }
    
    const forceScenes = storyboard.scenes.filter(s => s.force_present === true);
    const highEscalationScenes = storyboard.scenes.filter(s => (s.escalation_delta ?? 0) >= 2);
    const peakScenes = storyboard.scenes.filter(s => (s.escalation_delta ?? 0) >= 3);
    
    // FIX: Use setpiece_delta with proper fallback chain + normalization + logging
    const getSetpieceDelta = (s: GeneratedScene, i: number): string | null => {
      // Priority: setpiece_delta > state_to > action_summary (legacy)
      const rawDelta = s.setpiece_delta ?? s.state_to ?? s.action_summary ?? null;
      if (rawDelta && !s.setpiece_delta) {
        console.log(`[generate-storyboard] Scene ${i + 1}: using fallback for setpiece_delta (field used: ${s.state_to ? 'state_to' : 'action_summary'})`);
      }
      // Normalize: trim whitespace, lowercase, filter empty
      const normalized = rawDelta ? rawDelta.trim().toLowerCase() : null;
      return normalized && normalized.length > 0 ? normalized : null;
    };
    const uniqueSetpieceDeltas = new Set(
      storyboard.scenes.map((s, i) => getSetpieceDelta(s, i)).filter(Boolean)
    );

    const forceIssues: string[] = [];
    if (forceScenes.length < 2) {
      forceIssues.push(`force_present=${forceScenes.length}/2 (need more external pressure)`);
    }
    // Require 1 peak (escalation=3) + 2 high escalation
    if (peakScenes.length < 1) {
      forceIssues.push(`escalation_delta=3 count=${peakScenes.length}/1 (needs peak tension)`);
    }
    if (highEscalationScenes.length < 2) {
      forceIssues.push(`escalation_delta≥2 count=${highEscalationScenes.length}/2 (needs rising tension)`);
    }
    if (uniqueSetpieceDeltas.size < 2) {
      forceIssues.push(`setpiece_deltas=${uniqueSetpieceDeltas.size}/2 (need visible state changes)`);
    }

    if (forceIssues.length > 0) {
      console.warn(`[generate-storyboard] ⚠️ Escalation Contract not met:`);
      forceIssues.forEach(issue => console.warn(`  - ${issue}`));
      
      // FIX: Context-aware force type inference based on scene content
      const inferForceType = (scene: GeneratedScene): "weather" | "predator" | "hazard" | "pursuit" | "time" | "resource" | "social" => {
        const text = `${scene.prompt || ""} ${scene.alternate_subject || ""}`.toLowerCase();
        if (/water|rain|flood|storm|wind|snow|cold|heat|fire/.test(text)) return "weather";
        if (/spider|bird|shadow|predator|beast|creature|enemy|hunt|dragon|monster/.test(text)) return "predator";
        if (/chase|follow|track|escape|flee|run|pursuit/.test(text)) return "pursuit";
        if (/collapse|debris|fall|trap|rock|cliff|explosion|crash/.test(text)) return "hazard";
        if (/deadline|countdown|closing|timer|urgent/.test(text)) return "time";
        if (/crowd|rival|reject|social|pressure/.test(text)) return "social";
        return "hazard"; // Default
      };
      
      // Auto-fix: inject forces into mid-story scenes (indices 2-4) first
      const midSceneIndices = [2, 3, 4].filter(i => i < storyboard.scenes.length);
      let forcesAdded = 0;
      
      // First pass: spectacle scenes in mid-story
      for (const i of midSceneIndices) {
        if (forceScenes.length + forcesAdded >= 2) break;
        const scene = storyboard.scenes[i];
        if (!scene.force_present && scene.subject_required === false) {
          scene.force_present = true;
          scene.force_type = inferForceType(scene);
          scene.escalation_delta = 2;
          console.log(`[generate-storyboard] Auto-injected ${scene.force_type} force into spectacle scene ${i + 1}`);
          forcesAdded++;
        }
      }
      
      // Second pass: hero scenes in mid-story (2-4)
      for (const i of midSceneIndices) {
        if (forceScenes.length + forcesAdded >= 2) break;
        const scene = storyboard.scenes[i];
        if (!scene.force_present && scene.subject_required !== false) {
          scene.force_present = true;
          scene.force_type = inferForceType(scene);
          scene.escalation_delta = scene.escalation_delta ?? 2;
          console.log(`[generate-storyboard] Auto-injected ${scene.force_type} force into hero scene ${i + 1}`);
          forcesAdded++;
        }
      }
      
      // FIX: Ensure one peak scene (escalation=3) with safe bounds
      // For short stories (5 scenes), peakIndex = min(4, max(2, 3)) = 3 (scene 4, 0-indexed)
      // Never point to CTA (last scene) or hook (first scene)
      const peakIndex = Math.min(4, Math.max(2, storyboard.scenes.length - 2));
      if (peakScenes.length === 0 && peakIndex >= 0 && peakIndex < storyboard.scenes.length - 1) {
        storyboard.scenes[peakIndex].escalation_delta = 3;
        console.log(`[generate-storyboard] Set peak escalation_delta=3 on scene ${peakIndex + 1}`);
      }
      
      // Boost escalation on middle scenes (2-4 only, not all middle)
      for (const i of midSceneIndices.filter(idx => idx < storyboard.scenes.length - 1)) {
        const scene = storyboard.scenes[i];
        if ((scene.escalation_delta ?? 0) < 2) {
          scene.escalation_delta = 2;
          console.log(`[generate-storyboard] Boosted escalation_delta on scene ${i + 1}`);
        }
      }
    }
    
    // === STORY FORCES SUMMARY LOG (proves system is working) ===
    const finalForces = storyboard.scenes.filter(s => s.force_present === true).length;
    const finalPeakIdx = storyboard.scenes.findIndex(s => (s.escalation_delta ?? 0) >= 3);
    const finalHigh = storyboard.scenes.filter(s => (s.escalation_delta ?? 0) >= 2).length;
    const finalDeltas = new Set(storyboard.scenes.map((s, i) => getSetpieceDelta(s, i)).filter(Boolean)).size;
    
    // FIX: Use 1-based scene numbers everywhere for human readability
    console.log(`[generate-storyboard] ✓ Story Forces: forces=${finalForces}/${storyboard.scenes.length}, peak=${finalPeakIdx >= 0 ? `scene ${finalPeakIdx + 1}` : 'none'}, escalation≥2=${finalHigh}, unique_deltas=${finalDeltas}`);
    console.log(`[generate-storyboard] Per-scene breakdown:`);
    storyboard.scenes.forEach((s, i) => {
      const isSpectacle = s.subject_required === false;
      console.log(`  ${i + 1}: role=${isSpectacle ? 'spectacle' : 'hero'} force=${s.force_type || '-'} esc=${s.escalation_delta ?? 0} delta="${getSetpieceDelta(s, i)?.slice(0, 30) || '-'}"`);
    });
    
    // === NO-PROTAGONIST LANGUAGE CHECK (for spectacle scenes) ===
    // Spectacle prompts should NOT mention the protagonist
    const PROTAGONIST_PATTERNS = [
      /\b(the\s+)?(astronaut|knight|hero|protagonist|character|figure|warrior|soldier|explorer|adventurer|person|man|woman)\b/gi,
      /\b(he|she|they|him|her|them|his|hers|their)\s+(is|are|was|were|runs?|sprints?|dives?|grabs?|looks?|watches?|sees?|reacts?)/gi,
    ];
    
    const spectacleLanguageIssues = storyboard.scenes
      .filter(s => s.subject_required === false)
      .map((scene, i) => {
        const promptLower = scene.prompt.toLowerCase();
        const foundPatterns = PROTAGONIST_PATTERNS.filter(p => p.test(scene.prompt));
        // Reset lastIndex after each test
        PROTAGONIST_PATTERNS.forEach(p => p.lastIndex = 0);
        
        if (foundPatterns.length > 0) {
          return { sceneIndex: storyboard.scenes.indexOf(scene), prompt: scene.prompt.slice(0, 100) };
        }
        return null;
      })
      .filter(Boolean);
    
    if (spectacleLanguageIssues.length > 0) {
      console.warn(`[generate-storyboard] ⚠️ Spectacle scenes contain protagonist language:`);
      spectacleLanguageIssues.forEach((issue: { sceneIndex: number; prompt: string } | null) => {
        if (issue) {
          console.warn(`  Scene ${issue.sceneIndex + 1}: "${issue.prompt}..."`);
        }
      });
      // Auto-fix: strip protagonist references from spectacle prompts
      storyboard.scenes = storyboard.scenes.map(scene => {
        if (scene.subject_required === false) {
          let cleanedPrompt = scene.prompt;
          PROTAGONIST_PATTERNS.forEach(pattern => {
            cleanedPrompt = cleanedPrompt.replace(pattern, "");
            pattern.lastIndex = 0;
          });
          // Clean up double spaces
          cleanedPrompt = cleanedPrompt.replace(/\s+/g, " ").trim();
          if (cleanedPrompt !== scene.prompt) {
            console.log(`[generate-storyboard] Auto-cleaned scene ${storyboard.scenes.indexOf(scene) + 1}: "${cleanedPrompt.slice(0, 80)}..."`);
            return { ...scene, prompt: cleanedPrompt };
          }
        }
        return scene;
      });
    }
    
    // === SHOT SIGNATURE VARIETY CONTRACT ===
    // Prevent "scenes 4/5/6 identical" by ensuring adjacent scenes differ
    interface ShotSignature {
      framing: string;
      angle: string;
      motion: string;
      primaryAction: string;
    }
    
    const extractShotSignature = (scene: GeneratedScene): ShotSignature => {
      const prompt = scene.prompt.toLowerCase();
      const camDir = (scene.camera_direction || "").toLowerCase();
      
      // Extract framing from camera_direction or infer from coverage
      let framing = "medium";
      if (camDir.includes("wide") || camDir.includes("establish") || scene.coverage_type === "wide") framing = "wide";
      else if (camDir.includes("close") || scene.coverage_type === "face") framing = "close";
      else if (prompt.includes("full body") || scene.coverage_type === "body") framing = "full";
      
      // Extract angle
      let angle = "eye";
      if (camDir.includes("low") || prompt.includes("looking up")) angle = "low";
      else if (camDir.includes("high") || camDir.includes("overhead") || prompt.includes("looking down")) angle = "high";
      else if (camDir.includes("dutch") || camDir.includes("tilt")) angle = "dutch";
      
      // Extract motion
      let motion = "static";
      if (camDir.includes("track") || camDir.includes("follow")) motion = "tracking";
      else if (camDir.includes("pan") || camDir.includes("whip")) motion = "pan";
      else if (camDir.includes("dolly") || camDir.includes("push")) motion = "dolly";
      else if (camDir.includes("crane") || camDir.includes("jib")) motion = "crane";
      else if (camDir.includes("handheld")) motion = "handheld";
      
      // Extract primary action (first verb)
      const actionVerb = scene.beat_action?.split(",")[0]?.trim() || 
        REQUIRED_ACTION_VERBS.find(v => prompt.includes(v)) || "unknown";
      
      return { framing, angle, motion, primaryAction: actionVerb };
    };
    
    const signatures = storyboard.scenes.map(extractShotSignature);
    interface VarietyIssue {
      sceneIndex: number;
      type: "framing_angle" | "motion" | "action";
      detail: string;
    }
    const varietyIssues: VarietyIssue[] = [];
    
    for (let i = 1; i < signatures.length; i++) {
      const prev = signatures[i - 1];
      const curr = signatures[i];
      
      // Check for signature collision (framing + angle)
      if (prev.framing === curr.framing && prev.angle === curr.angle) {
        varietyIssues.push({ 
          sceneIndex: i, 
          type: "framing_angle", 
          detail: `same framing+angle (${curr.framing}/${curr.angle})` 
        });
      }
      
      // Check for same motion
      if (prev.motion === curr.motion && prev.motion !== "static") {
        varietyIssues.push({ 
          sceneIndex: i, 
          type: "motion", 
          detail: `same motion (${curr.motion})` 
        });
      }
      
      // Check for same primary action
      if (prev.primaryAction === curr.primaryAction && prev.primaryAction !== "unknown") {
        varietyIssues.push({ 
          sceneIndex: i, 
          type: "action", 
          detail: `same action verb (${curr.primaryAction})` 
        });
      }
    }
    
    // === AUTO-REWRITE COLLIDING SCENES (max 2 retries) ===
    const MAX_VARIETY_RETRIES = 2;
    let varietyRetryCount = 0;
    
    while (varietyIssues.length > 0 && varietyRetryCount < MAX_VARIETY_RETRIES) {
      varietyRetryCount++;
      console.log(`[generate-storyboard] 🔄 Variety retry ${varietyRetryCount}/${MAX_VARIETY_RETRIES}: ${varietyIssues.length} collisions`);
      
      // Get unique scene indices that need rewriting
      const scenesToRewrite = [...new Set(varietyIssues.map(i => i.sceneIndex))];
      
      for (const sceneIndex of scenesToRewrite) {
        const scene = storyboard.scenes[sceneIndex];
        const prevScene = storyboard.scenes[sceneIndex - 1];
        const prevSig = signatures[sceneIndex - 1];
        const issuesForScene = varietyIssues.filter(i => i.sceneIndex === sceneIndex);
        
        // Build rewrite constraint based on what needs to change
        const constraints: string[] = [];
        if (issuesForScene.some(i => i.type === "framing_angle")) {
          // Force different framing OR different angle
          const newFraming = prevSig.framing === "wide" ? "close" : (prevSig.framing === "close" ? "medium" : "wide");
          const newAngle = prevSig.angle === "eye" ? "low" : (prevSig.angle === "low" ? "high" : "eye");
          constraints.push(`MUST use ${newFraming} framing OR ${newAngle} angle`);
        }
        if (issuesForScene.some(i => i.type === "motion")) {
          const altMotions = ["tracking", "dolly", "crane", "handheld", "pan"].filter(m => m !== prevSig.motion);
          constraints.push(`MUST use ${altMotions[0]} or ${altMotions[1]} camera motion (NOT ${prevSig.motion})`);
        }
        if (issuesForScene.some(i => i.type === "action")) {
          constraints.push(`MUST use a DIFFERENT primary action verb (NOT ${prevSig.primaryAction})`);
        }
        
        // Quick rewrite request (single scene)
        const rewritePrompt = `Rewrite ONLY this scene prompt to fix shot signature collision:

ORIGINAL SCENE ${sceneIndex + 1}:
prompt: "${scene.prompt}"
camera_direction: "${scene.camera_direction}"
role: "${scene.role}"

PREVIOUS SCENE ${sceneIndex} (for context):
prompt: "${prevScene.prompt}"
camera_direction: "${prevScene.camera_direction}"

CONSTRAINTS (MUST follow):
${constraints.join("\n")}

Return ONLY the rewritten scene as JSON:
{
  "prompt": "...",
  "camera_direction": "..."
}

Keep the same action intent, just change the shot design.`;

        console.log(`[generate-storyboard] Rewriting scene ${sceneIndex + 1} with constraints: ${constraints.join("; ")}`);
        
        try {
          const rewriteResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${openaiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4o-mini", // Use mini for fast rewrites
              messages: [
                { role: "system", content: "You are a cinematographer. Return only valid JSON, no markdown." },
                { role: "user", content: rewritePrompt },
              ],
              temperature: 0.9, // Higher temp for variety
              max_tokens: 300,
            }),
          });

          if (rewriteResponse.ok) {
            const rewriteData = await rewriteResponse.json();
            const rewriteContent = rewriteData.choices?.[0]?.message?.content || "";
            const rewriteMatch = rewriteContent.match(/\{[\s\S]*\}/);
            
            if (rewriteMatch) {
              const rewrite = JSON.parse(rewriteMatch[0]);
              if (rewrite.prompt) {
                storyboard.scenes[sceneIndex].prompt = rewrite.prompt;
                console.log(`[generate-storyboard] ✓ Rewrote scene ${sceneIndex + 1}`);
              }
              if (rewrite.camera_direction) {
                storyboard.scenes[sceneIndex].camera_direction = rewrite.camera_direction;
              }
            }
          }
        } catch (rewriteError) {
          console.warn(`[generate-storyboard] Rewrite failed for scene ${sceneIndex + 1}:`, rewriteError);
          // Continue with original - variety issues logged but not blocking
        }
      }
      
      // Re-extract signatures and check for remaining issues
      const newSignatures = storyboard.scenes.map(extractShotSignature);
      Object.assign(signatures, newSignatures);
      
      // Clear and re-check
      varietyIssues.length = 0;
      for (let i = 1; i < signatures.length; i++) {
        const prev = signatures[i - 1];
        const curr = signatures[i];
        if (prev.framing === curr.framing && prev.angle === curr.angle) {
          varietyIssues.push({ sceneIndex: i, type: "framing_angle", detail: `same framing+angle` });
        }
        if (prev.motion === curr.motion && prev.motion !== "static") {
          varietyIssues.push({ sceneIndex: i, type: "motion", detail: `same motion` });
        }
        if (prev.primaryAction === curr.primaryAction && prev.primaryAction !== "unknown") {
          varietyIssues.push({ sceneIndex: i, type: "action", detail: `same action` });
        }
      }
    }
    
    if (varietyIssues.length > 0) {
      console.warn(`[generate-storyboard] ⚠️ Shot Signature issues remain after ${varietyRetryCount} retries:`);
      varietyIssues.forEach(issue => console.warn(`  - Scene ${issue.sceneIndex + 1}: ${issue.detail}`));
      // Log but don't fail - Face-Only I2V + T2V motion freedom will help
    } else {
      console.log(`[generate-storyboard] ✓ Shot Signature Variety: all adjacent scenes differ${varietyRetryCount > 0 ? ` (after ${varietyRetryCount} rewrites)` : ""}`);
    }

    // Ensure negative_list always has base items
    const baseNegatives = ["flicker", "jitter", "identity drift", "morph"];
    if (storyboard.anchors) {
      storyboard.anchors.negative_list = [
        ...new Set([...(storyboard.anchors.negative_list || []), ...baseNegatives])
      ];
    }

    // Ensure Director Brain fields have defaults
    const storySpine = storyboard.story_spine || "";
    const motifAnchors = storyboard.motif_anchors || [];
    const paletteKeywords = storyboard.palette_keywords || [];

    // Auto-select hero shot (story_b preferred, else story_a)
    const hasStoryB = storyboard.scenes.some(s => s.role === "story_b");
    const heroRole = hasStoryB ? "story_b" : "story_a";

    // Stable storyboard ID for collision-safe scene IDs
    const storyboardId = crypto.randomUUID?.() ?? `sb_${Date.now()}`;

    // Zone duration configs for suggestions
    type ZoneDuration = { min: number; max: number; reason: string };
    const ZONE_DURATIONS: Record<CutZone, ZoneDuration> = {
      hook: { min: 0.4, max: 0.9, reason: "Pattern interrupt - keep it punchy" },
      setup: { min: 1.2, max: 2.0, reason: "Establish context" },
      escalation: { min: 1.0, max: 1.8, reason: "Build tension" },
      payoff: { min: 1.8, max: 3.5, reason: "Let it land" },
      button: { min: 1.0, max: 2.0, reason: "Clean hold for CTA" },
    };

    // Default cut types by role (deterministic, not relying on GPT)
    const DEFAULT_CUT_TYPES: Record<SceneRole, CutType> = {
      hook: "hard",
      problem: "hard",
      story_a: "continuity",
      reset: "hard",
      story_b: "continuity",
      cta: "hard",
      atmosphere: "hard",
      establish: "hard",
    };
    
    // Roles that can source continuity (previous scene must be one of these)
    const CONTINUITY_SOURCE_ROLES: SceneRole[] = ["problem", "story_a", "story_b"];

    // Add IDs, sequence, zone, duration suggestions, and cut_type
    const totalScenes = storyboard.scenes.length;
    const scenesWithIds = storyboard.scenes.map((scene, i) => {
      const isFinalScene = i === totalScenes - 1;
      const effectiveRole: SceneRole = (scene.role as SceneRole) || "story_a";
      const positionRatio = i / Math.max(totalScenes - 1, 1);
      
      // Bridge change_type early for conditional zone logic
      const effectiveChangeType = scene.change_type 
        || (scene as { defaultChangeType?: ChangeType }).defaultChangeType 
        || "info";
      
      // === CUT TYPE RESOLUTION (deterministic) ===
      // Get previous scene's role for continuity eligibility check
      const prevScene = i > 0 ? storyboard.scenes[i - 1] : null;
      const prevRole: SceneRole | null = prevScene 
        ? ((prevScene.role as SceneRole) || "story_a") 
        : null;
      
      let computedCutType: CutType = DEFAULT_CUT_TYPES[effectiveRole] || "hard";
      
      // Rule 1: First scene is ALWAYS hard (T2V)
      if (i === 0) {
        computedCutType = "hard";
      }
      // Rule 2: hook/cta/reset are ALWAYS hard
      else if (effectiveRole === "hook" || effectiveRole === "cta" || effectiveRole === "reset") {
        computedCutType = "hard";
      }
      // Rule 3: continuity only if previous role is eligible
      else if (computedCutType === "continuity") {
        if (!prevRole || !CONTINUITY_SOURCE_ROLES.includes(prevRole)) {
          computedCutType = "hard"; // Can't chain from non-eligible role
        }
      }
      // Note: Provider switch check happens in continue-story-chain (we don't know provider here)
      
      console.log(`[generate-storyboard] Scene ${i}: role=${effectiveRole} cut_type=${computedCutType}`);
      
      // Compute zone: use GPT-provided zone, or derive from role
      // Final CTA uses "button" zone for clean hold
      // Early "info" resets use hook speed (pattern interrupt)
      let computedZone: CutZone = (isFinalScene && effectiveRole === "cta") 
        ? "button" 
        : (scene as { zone?: CutZone }).zone || ROLE_TO_ZONE[effectiveRole] || "setup";
      
      // Reset speed override: early info-resets get hook pacing
      if (effectiveRole === "reset" && effectiveChangeType === "info" && positionRatio < 0.4) {
        computedZone = "hook";
      }

      // Duration suggestion based on zone + position
      const zoneDuration = ZONE_DURATIONS[computedZone];
      
      // Zone-specific duration multiplier (payoff breathes, hook stays punchy)
      let t = 0.5; // default midpoint
      if (computedZone === "hook") t = 0.3;
      else if (computedZone === "button") t = 0.5;
      else if (computedZone === "setup") t = positionRatio < 0.35 ? 0.35 : 0.5;
      else if (computedZone === "escalation") t = 0.5; // keep tight
      else if (computedZone === "payoff") t = positionRatio > 0.7 ? 0.7 : 0.6;
      
      const durationMid = zoneDuration.min + (zoneDuration.max - zoneDuration.min) * t;
      
      return {
        id: `scene_${storyboardId}_${i}`,
        ...scene,
        // Force role in output (prevent undefined leaking)
        role: effectiveRole,
        sequence_index: i,
        // Use pre-computed change_type (already bridged from defaultChangeType)
        change_type: effectiveChangeType,
        // CUT TYPE (deterministic, key for I2V vs T2V)
        cut_type: computedCutType,
        // Compute zone from role if not provided
        zone: computedZone,
        // Duration guidance from zone
        duration_suggested: Math.round(durationMid * 10) / 10,
        duration_min: zoneDuration.min,
        duration_max: zoneDuration.max,
        duration_reason: zoneDuration.reason,
        // Mark hero shot (one per story in volume tier)
        is_hero_shot: tier === "hero" 
          ? ["story_a", "story_b", "establish"].includes(effectiveRole)
          : effectiveRole === heroRole,
        // Story Forces (Phase 8) - explicitly preserve
        force_present: scene.force_present,
        force_type: scene.force_type,
        escalation_delta: scene.escalation_delta,
        setpiece_delta: scene.setpiece_delta ?? scene.state_to ?? null,
        // Preserve other transformation fields
        state_from: scene.state_from,
        state_to: scene.state_to,
        alternate_subject: scene.alternate_subject,
      };
    });

    return new Response(
      JSON.stringify({
        title: storyboard.title,
        story_spine: storySpine,
        motif_anchors: motifAnchors,
        palette_keywords: paletteKeywords,
        scenes: scenesWithIds,
        anchors: storyboard.anchors,
        tier, // Persist tier in storyboard output
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("generate-storyboard error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
