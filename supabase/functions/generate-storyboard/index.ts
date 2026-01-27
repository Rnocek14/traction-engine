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

// === ACTION VERB ENFORCEMENT ===
// These verbs create "static tableaux" - Sora interprets them as "hold this pose"
const BANNED_VERBS = [
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

// These verbs FORCE physical action - at least one must appear in first 20 words
const REQUIRED_ACTION_VERBS = [
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
🎬 ACTION BEAT SCHEMA (CRITICAL - READ CAREFULLY)
═══════════════════════════════════════════════════════════════════════════════

Every scene MUST contain PHYSICAL ACTION, not contemplation.
Static scenes will be REJECTED. Video AI interprets static verbs as "freeze".

For each scene, you MUST provide a 3-BEAT ACTION STRUCTURE:
1. beat_trigger: "What external event forces action" (storm hits, door opens, branch snaps)
2. beat_action: "Physical verb the character performs" (dives, grabs, sprints, leaps)
3. beat_result: "Observable end-state" (lands behind rock, holds object, enters new space)

BANNED VERBS (scenes will be rejected if these are the main action):
stand, stands, gaze, gazes, look, looks, observe, hesitate, wonder, feel, realize,
contemplate, notice, see, watch, stare, hold, holds, sit, sits, wait, pause

REQUIRED ACTION VERBS (main action MUST use one of these):
run, sprint, dodge, grab, slam, leap, stumble, turn, spin, rip, collide, dive,
tackle, climb, yank, recoil, throw, catch, push, pull, fall, jump, reach, step,
duck, roll, strike, block, tear, smash, swing, crash, burst, scramble, surge,
sweep, snap, whip, lunge, twist, slide, plunge, vault, hurl, drop, lift

THE ACTION MUST APPEAR IN THE FIRST 20 WORDS OF THE PROMPT.

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

CRITICAL RULES FOR NARRATIVE GLUE:
- The prompt's FIRST CLAUSE must contain an action verb (not buried later)
- beat_action must be a physical verb (shifts, changes, transforms, moves, turns, reacts, responds, realizes, decides)
- state_from and state_to must be DIFFERENT (if they're the same, the scene is static)
- end_state describes the OBSERVABLE RESULT that the next scene will react to
- Each scene must RESPOND to the previous scene's end_state (cause → effect)

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

Respond ONLY with valid JSON in this exact format:
{
  "title": "Story title",
  "story_spine": "Person discovers X → tries Y → realizes Z → resolves with W",
  "motif_anchors": ["visual metaphor 1", "visual metaphor 2"],
  "palette_keywords": ["color 1", "color 2", "texture"],
  "scenes": [
    {
      "prompt": "ACTION VERB FIRST: The Martian DIVES for cover as dust storm...",
      "beat_trigger": "dust storm crashes over ridge",
      "beat_action": "dives, scrambles",
      "beat_result": "reaches shelter behind rock",
      "action_summary": "Subject transforms from [state A] to [state B]",
      "state_from": "initial observable state",
      "state_to": "final observable state (must differ from state_from)",
      "end_state": "What is true at the end of this clip",
      "duration_target": 5,
      "camera_direction": "Camera movement and framing notes",
      "role": "story_a",
      "change_type": "info",
      "narration_line": "Optional TTS line for this beat",
      "onscreen_text": "Optional text overlay"
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
    const { concept, story_type = "short_story", scene_count, tier = "volume" } = body as GenerateRequest & { tier?: string };

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
