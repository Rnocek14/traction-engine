/**
 * Provider-Specific Prompt Compiler v2
 * 
 * Each provider has distinct prompt requirements:
 * - Runway: Short, motion-first, 30-100 chars, camera keyword FIRST
 * - Luma: Physics-based motion, camera keywords early, style last
 * - Sora: Director's Brief style, detailed but structured
 * 
 * This compiler ensures prompts are correctly formatted and never truncated.
 */

export type VideoProvider = "sora" | "runway" | "luma";

export interface PromptCompilerInput {
  userPrompt: string;       // Original user concept
  styleHints?: string;      // Optional style hints
  cameraDirection?: string; // Optional camera direction override
}

export interface CompiledPrompt {
  provider: VideoProvider;
  providerPrompt: string;   // What the model receives (optimized format)
  originalPrompt: string;   // User's original input
  enrichedPrompt: string;   // Full enrichment (for debugging)
  schemaVersion: string;    // For tracking changes
  charCount: number;        // Actual character count
  maxChars: number;         // Provider limit
  wasCompressed: boolean;   // True if we had to compress
}

// Provider-specific limits (research-based)
export const PROVIDER_LIMITS: Record<VideoProvider, { maxChars: number; idealChars: number }> = {
  runway: { maxChars: 150, idealChars: 80 },    // Runway: very concise, motion-first
  luma: { maxChars: 300, idealChars: 200 },     // Luma: moderate, physics-focused
  sora: { maxChars: 800, idealChars: 500 },     // Sora: detailed, director's brief
};

// Camera movement keywords that should come FIRST for Runway/Luma
const CAMERA_KEYWORDS = [
  "Static", "Tracking", "Pan", "Dolly", "Crane", "Handheld", "Steadicam",
  "Push in", "Pull back", "Arc", "Orbit", "Whip pan", "Tilt", "Zoom",
  "POV", "Aerial", "Low angle", "High angle", "Dutch angle", "Following",
];

// Motion verbs that help Runway understand action
const MOTION_VERBS = [
  "glides", "rushes", "sweeps", "drifts", "accelerates", "floats",
  "crashes", "dances", "swirls", "explodes", "ripples", "flows",
  "tumbles", "soars", "plunges", "emerges", "dissolves", "transforms",
  "walks", "runs", "moves", "sips", "pours", "stirs", "lifts", "reaches",
  "turns", "spins", "rotates", "slides", "drops", "rises", "falls",
  "enters", "exits", "approaches", "retreats", "advances", "crosses",
];

/**
 * Get GPT-4o system prompt optimized for each provider
 */
export function getProviderSystemPrompt(provider: VideoProvider): string {
  const baseRules = `
CRITICAL RULES:
- Describe REAL, PHOTOREALISTIC content only
- NEVER use: "animated", "3D render", "cartoon", "illustration", "CGI"
- Focus on ONE continuous 5-10 second moment
- Describe what the CAMERA SEES, not abstract concepts
- Avoid UI elements, text overlays, or screen recordings`;

  switch (provider) {
    case "runway":
      return `You are writing ultra-concise video prompts for Runway Gen-3.

FORMAT: [Camera movement]: [Subject] [motion verb] [through/in environment]

REQUIREMENTS:
- Start with camera movement keyword (Static, Tracking, Pan, Dolly, etc.)
- Keep under 80 characters ideally, max 150
- One sentence only
- Motion verb is REQUIRED (glides, rushes, sweeps, drifts, etc.)
- No mood/emotion words - pure visual description
- No lighting descriptions unless critical
${baseRules}

EXAMPLES:
✓ "Tracking shot: woman runs through rain-soaked Tokyo street at night"
✓ "Static close-up: coffee steam rises in golden morning light"
✓ "Dolly in: man walks toward camera in misty forest"
✗ "A beautiful cinematic scene of a woman feeling melancholy as she..." (too long, no camera, emotional)

Output ONLY the prompt, nothing else.`;

    case "luma":
      return `You are writing physics-focused video prompts for Luma Ray-2.

FORMAT: [Camera]: [Subject] [physics-based motion] [environment interaction]

REQUIREMENTS:
- Start with camera type/movement
- Emphasize how things PHYSICALLY MOVE and INTERACT
- Describe fluid dynamics, gravity, momentum, collisions
- Keep under 200 characters ideally, max 300
- Style/mood comes LAST if included
${baseRules}

GOOD PHYSICS WORDS: flows, ripples, cascades, settles, bounces, swirls, 
drifts, shatters, splashes, billows, crumbles, unfurls, disperses

EXAMPLES:
✓ "Handheld: smoke billows from incense, curling upward through dusty sunbeams"
✓ "Static wide: ocean wave crashes into rocks, spray disperses in slow motion"
✓ "Tracking: leaves swirl around woman walking, fabric flowing in wind"
✗ "A moody atmospheric scene with ethereal beauty..." (no physics, too abstract)

Output ONLY the prompt, nothing else.`;

    case "sora":
      return `You are a cinematographer writing Director's Brief prompts for Sora 2.

FORMAT: Structured brief with these elements:
1. CAMERA: Specific shot type + movement + lens hint
2. SUBJECT: Who/what + distinguishing details
3. ACTION: The motion arc (setup → action → completion)
4. ENVIRONMENT: Location + time + weather/atmosphere
5. STYLE: Color grade, lighting, film reference if helpful

REQUIREMENTS:
- Can be detailed (up to 500 characters ideal, max 800)
- Use cinematic terminology (rack focus, shallow DoF, magic hour)
- Describe a clear motion arc, not a static moment
- Include specific lens hints when relevant (35mm, anamorphic, telephoto)
${baseRules}

EXAMPLE:
"Steadicam follows: A solo violinist in black formal wear walks through an abandoned concert hall, dust particles catching in the shafts of light from broken skylights. Camera drifts around her as she plays, the sound echoing off marble walls. Wide 24mm lens, Kodak film grain, golden hour rays, melancholic atmosphere."

Output ONLY the prompt, nothing else.`;

    default:
      return `Write a concise, motion-focused video prompt under 200 characters.${baseRules}`;
  }
}

/**
 * Compress a prompt to fit within provider limits while preserving key elements
 */
export function compressPrompt(prompt: string, provider: VideoProvider): string {
  const limit = PROVIDER_LIMITS[provider].maxChars;
  if (prompt.length <= limit) return prompt;

  // Strategy varies by provider
  if (provider === "runway") {
    // Runway: Keep camera + subject + motion verb, drop everything else
    // Find first sentence or first 80 chars
    const firstSentence = prompt.split(/[.!]/).find(s => s.trim().length > 20);
    if (firstSentence && firstSentence.length <= limit) {
      return firstSentence.trim();
    }
    // Hard cut with ellipsis removal
    return prompt.substring(0, limit - 1).replace(/[,\\s]+$/, '');
  }

  if (provider === "luma") {
    // Luma: Keep physics motion, cut style/mood at end
    const sentences = prompt.split(/[.!]/);
    let result = "";
    for (const s of sentences) {
      if ((result + s).length > limit - 10) break;
      result += s.trim() + ". ";
    }
    return result.trim() || prompt.substring(0, limit - 1).replace(/[,\\s]+$/, '');
  }

  // Sora: More forgiving, just trim
  return prompt.substring(0, limit - 3) + "...";
}

/**
 * Ensure camera keyword is at the start (critical for Runway/Luma)
 */
export function ensureCameraFirst(prompt: string, provider: VideoProvider): string {
  if (provider === "sora") return prompt; // Sora doesn't need this

  // Check if already starts with camera keyword
  const startsWithCamera = CAMERA_KEYWORDS.some(kw => 
    prompt.toLowerCase().startsWith(kw.toLowerCase())
  );
  
  if (startsWithCamera) return prompt;

  // Try to find and move camera keyword to front
  for (const kw of CAMERA_KEYWORDS) {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    const match = prompt.match(regex);
    if (match) {
      // Extract the camera phrase and move it to front
      const cameraIndex = prompt.toLowerCase().indexOf(kw.toLowerCase());
      if (cameraIndex > 0) {
        // Find end of camera phrase (usually at colon or comma)
        const restOfPrompt = prompt.substring(cameraIndex);
        const colonIndex = restOfPrompt.indexOf(':');
        if (colonIndex > 0 && colonIndex < 30) {
          const cameraPhrase = restOfPrompt.substring(0, colonIndex + 1);
          const before = prompt.substring(0, cameraIndex).trim().replace(/[,;:\\s]+$/, '');
          const after = restOfPrompt.substring(colonIndex + 1).trim();
          return `${cameraPhrase} ${before} ${after}`.replace(/\s+/g, ' ').trim();
        }
      }
    }
  }

  // No camera found, prepend a default
  const defaultCamera = provider === "runway" ? "Tracking shot:" : "Camera follows:";
  return `${defaultCamera} ${prompt}`;
}

/**
 * Ensure motion verb exists (critical for Runway)
 */
export function ensureMotionVerb(prompt: string, provider: VideoProvider): string {
  if (provider !== "runway") return prompt;

  const hasMotion = MOTION_VERBS.some(verb => 
    prompt.toLowerCase().includes(verb)
  );

  if (hasMotion) return prompt;

  // Try to inject a motion verb near the subject
  // Look for patterns like "subject [static verb]" and replace
  const staticVerbs = ["is", "sits", "stands", "looks", "watches", "holds"];
  for (const sv of staticVerbs) {
    const regex = new RegExp(`\\b${sv}\\b`, 'gi');
    if (prompt.match(regex)) {
      // Replace with a more dynamic verb
      const dynamicMap: Record<string, string> = {
        "is": "moves",
        "sits": "settles",
        "stands": "emerges",
        "looks": "gazes while drifting",
        "watches": "observes while floating",
        "holds": "grasps while swaying",
      };
      return prompt.replace(regex, dynamicMap[sv] || "moves");
    }
  }

  return prompt;
}

/**
 * Validate and post-process a compiled prompt
 */
export function validateCompiledPrompt(compiled: CompiledPrompt): CompiledPrompt {
  // Ensure we never truncate at weird points
  if (compiled.providerPrompt.endsWith('...') && compiled.providerPrompt.length > 10) {
    // Remove trailing ellipsis if it was added unnecessarily
    const withoutEllipsis = compiled.providerPrompt.slice(0, -3);
    if (withoutEllipsis.length <= compiled.maxChars) {
      compiled.providerPrompt = withoutEllipsis;
      compiled.charCount = withoutEllipsis.length;
    }
  }

  // Ensure prompt doesn't end mid-word
  if (!compiled.providerPrompt.match(/[.!?"]$/)) {
    // Find last complete word
    const lastSpace = compiled.providerPrompt.lastIndexOf(' ');
    if (lastSpace > compiled.charCount * 0.7) {
      compiled.providerPrompt = compiled.providerPrompt.substring(0, lastSpace).trim();
      compiled.charCount = compiled.providerPrompt.length;
    }
  }

  return compiled;
}

/**
 * Main compilation function - called AFTER GPT enrichment
 * Ensures the enriched prompt meets provider requirements
 */
export function compileForProvider(
  provider: VideoProvider,
  enrichedPrompt: string,
  originalPrompt: string
): CompiledPrompt {
  const limits = PROVIDER_LIMITS[provider];
  let providerPrompt = enrichedPrompt;
  let wasCompressed = false;

  // Step 0: Clean up any extraneous quotes that GPT sometimes adds
  providerPrompt = providerPrompt.replace(/^["']+|["']+$/g, '').trim();
  providerPrompt = providerPrompt.replace(/: ["']+/g, ': ').trim();

  // Step 1: Ensure camera keyword is first (Runway/Luma)
  providerPrompt = ensureCameraFirst(providerPrompt, provider);

  // Step 2: Ensure motion verb exists (Runway)
  providerPrompt = ensureMotionVerb(providerPrompt, provider);

  // Step 3: Compress if needed
  if (providerPrompt.length > limits.maxChars) {
    providerPrompt = compressPrompt(providerPrompt, provider);
    wasCompressed = true;
  }

  const compiled: CompiledPrompt = {
    provider,
    providerPrompt,
    originalPrompt,
    enrichedPrompt, // Keep full enrichment for debugging
    schemaVersion: "v2.0",
    charCount: providerPrompt.length,
    maxChars: limits.maxChars,
    wasCompressed,
  };

  return validateCompiledPrompt(compiled);
}

/**
 * Quick check if a raw prompt needs enrichment
 */
export function needsEnrichment(prompt: string): boolean {
  // Very short prompts definitely need enrichment
  if (prompt.length < 30) return true;
  
  // Check if already has structure (camera + motion)
  const hasCamera = CAMERA_KEYWORDS.some(kw => 
    prompt.toLowerCase().includes(kw.toLowerCase())
  );
  const hasMotion = MOTION_VERBS.some(verb => 
    prompt.toLowerCase().includes(verb)
  );

  // If missing both, needs enrichment
  return !hasCamera && !hasMotion;
}
