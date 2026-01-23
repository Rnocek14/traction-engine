/**
 * Cinematic prompt builder for Sora 2 video generation.
 * Implements film-industry standard terminology for maximum quality.
 * 
 * This is the SINGLE SOURCE OF TRUTH for prompt building.
 * Both queue-video and generate-reel-sequence must use these functions.
 */

export interface StyleGuideData {
  character?: string;
  location?: string;
  lighting?: string;
  camera_style?: string;
  color_grade?: string;
  mood?: string;
  custom_notes?: string;
  // Advanced cinematography
  lens?: string;
  depth_of_field?: string;
  motion_style?: string;
  film_stock?: string;
  // Continuity anchors
  wardrobe?: string;
  props?: string;
  time_of_day?: string;
  // First-clip reference image
  reference_image_url?: string;
}

/**
 * Technical lens specifications for each lens type
 */
const LENS_SPECS: Record<string, string> = {
  "24mm": "24mm wide angle lens, expansive field of view, slight barrel distortion, environmental context",
  "35mm": "35mm lens, natural perspective, documentary feel, intimate yet contextual framing",
  "50mm": "50mm standard lens, most natural perspective matching human eye, balanced framing",
  "85mm": "85mm portrait lens, beautiful subject separation, flattering compression, shallow DOF",
  "135mm": "135mm telephoto, strong background compression, isolated subjects, creamy bokeh",
};

/**
 * Technical camera specifications for each camera style
 */
const CAMERA_SPECS: Record<string, string> = {
  documentary: "Handheld camera with subtle breathing movement, intimate close-ups, natural imperfections, authentic feel",
  cinematic: "Smooth dolly and crane movements, anamorphic lens characteristics, shallow depth of field, dramatic reveals",
  vlog: "Wide 24mm first-person POV, direct address to camera, casual handheld framing, authentic and personal",
  static: "Locked-off tripod shots, perfectly stable, deliberate minimal movement, tableau compositions",
  dynamic: "Steadicam tracking shots, fluid camera reveals, push-ins on emotional beats, motivated movement",
};

/**
 * Technical lighting specifications
 */
const LIGHTING_SPECS: Record<string, string> = {
  natural: "Soft diffused daylight from large window source, fill from ambient bounce, 5600K color temperature, natural shadows",
  golden_hour: "Warm 3200K backlight, long directional shadows, lens flare permitted, magic hour glow, orange rim light",
  studio: "Three-point lighting setup, key at 45 degrees, soft fill, edge light for separation, 4500K neutral, controlled exposure",
  dramatic: "High contrast chiaroscuro lighting, single hard source, deep shadows, motivated by practical lights in scene",
  soft: "Overcast skylight quality, minimal shadows, beauty dish aesthetic, even exposure across face, flattering diffusion",
};

/**
 * Technical color grading specifications
 */
const COLOR_SPECS: Record<string, string> = {
  warm: "Warm amber color grade, lifted shadows with orange tint, protected skin tones, cozy emotional feel",
  cool: "Cool teal shadows, clean bright highlights, modern commercial look, slight desaturation, clinical precision",
  neutral: "True-to-life natural colors, balanced white point, documentary grade, accurate skin tones, minimal stylization",
  vintage: "Kodak Portra 400 film emulation, subtle organic grain, lifted blacks, muted saturation, nostalgic warmth",
  high_contrast: "S-curve contrast enhancement, crushed blacks, punchy saturation, bold cinematic look, vibrant colors",
};

/**
 * Depth of field specifications
 */
const DOF_SPECS: Record<string, string> = {
  shallow: "f/1.8-2.8 aperture, creamy background blur, strong subject separation, bokeh visible on highlights",
  medium: "f/4-5.6 aperture, subject sharp with softened background, balanced focus depth, versatile look",
  deep: "f/8-11 aperture, front-to-back sharpness, environmental context clear, everything in focus",
};

/**
 * Motion style specifications
 */
const MOTION_SPECS: Record<string, string> = {
  smooth: "Buttery smooth camera movements, stabilized dolly/slider, no sudden changes, flowing and graceful",
  handheld: "Subtle organic handheld movement, breathing micro-shake, human imperfection, documentary authenticity",
  static: "Completely locked-off camera, zero movement, tableau framing, action happens within frame",
  tracking: "Following camera movement, subject-locked tracking, lateral or forward movement, dynamic energy",
};

/**
 * Film stock emulation specifications
 */
const FILM_SPECS: Record<string, string> = {
  digital: "Clean digital capture, no grain, full dynamic range, modern clinical precision",
  portra: "Kodak Portra film emulation, warm skin tones, subtle grain, lifted shadows, romantic softness",
  ektar: "Kodak Ektar emulation, vivid saturated colors, fine grain, high contrast, punchy vibrance",
  cinestill: "CineStill 800T emulation, tungsten color cast, visible grain, halation on highlights, cinematic mood",
};

/**
 * Time of day lighting characteristics
 */
const TIME_SPECS: Record<string, string> = {
  dawn: "Pre-sunrise blue hour, soft cool light, minimal shadows, peaceful quiet atmosphere",
  morning: "Early morning soft light, slightly warm, gentle shadows, fresh and hopeful feeling",
  midday: "Overhead sun, harder shadows, neutral color temperature, high contrast, energetic",
  golden_hour: "Hour before sunset, warm directional light, long shadows, magical romantic glow",
  dusk: "Post-sunset blue hour, ambient soft light, cool tones, contemplative mood",
  night: "Nighttime lighting, practical sources, high contrast pools of light, cinematic noir",
};

/**
 * Camera shot/framing types for per-clip direction
 */
export const SHOT_TYPES: Record<string, string> = {
  "extreme-wide": "Extreme wide shot (EWS), vast environment, subject small in frame, establishing scale",
  "wide": "Wide shot (WS), full body visible, environmental context, scene-setting",
  "medium-wide": "Medium wide shot (MWS), knees up, action space, movement room",
  "medium": "Medium shot (MS), waist up, conversational distance, balanced framing",
  "medium-close": "Medium close-up (MCU), chest up, emotional connection, intimate but contextual",
  "close-up": "Close-up (CU), face fills frame, emotional intensity, subtle expressions",
  "extreme-close": "Extreme close-up (ECU), detail shot, eyes/hands/texture, maximum intimacy",
  "over-shoulder": "Over-the-shoulder (OTS), perspective shot, conversational, subjective POV",
  "pov": "Point-of-view (POV), first-person perspective, subjective experience, immersive",
  "dutch": "Dutch angle, tilted frame, tension/unease, stylized composition",
  "low-angle": "Low angle shot, looking up at subject, power/heroic, imposing presence",
  "high-angle": "High angle shot, looking down at subject, vulnerability, overview perspective",
  "tracking": "Tracking shot, following subject movement, dynamic energy, continuous action",
  "crane": "Crane/jib shot, vertical movement, reveal, epic scope",
};

/**
 * Build a cinematic "shot brief" prompt for Sora 2
 * This is the main function - use for ALL video generation.
 */
export function buildCinematicPrompt(
  styleGuide: StyleGuideData | null,
  scenePrompt: string,
  isFirstClip: boolean,
  clipCameraDirection?: string
): string {
  const sections: string[] = [];
  
  // Header
  sections.push("=== DIRECTOR'S BRIEF ===\n");
  
  // Subject continuity lock (critical for consistency)
  if (styleGuide?.character) {
    sections.push(`SUBJECT: ${styleGuide.character}. Maintain EXACT appearance, features, and proportions throughout.`);
    
    if (styleGuide.wardrobe) {
      sections.push(`WARDROBE: ${styleGuide.wardrobe}. Same clothing in every frame.`);
    }
  }
  
  // Environment
  if (styleGuide?.location) {
    sections.push(`ENVIRONMENT: ${styleGuide.location}.`);
  }
  
  // Time of day
  if (styleGuide?.time_of_day && TIME_SPECS[styleGuide.time_of_day]) {
    sections.push(`TIME: ${TIME_SPECS[styleGuide.time_of_day]}`);
  }
  
  // Props
  if (styleGuide?.props) {
    sections.push(`PROPS: ${styleGuide.props}`);
  }
  
  // Cinematography section
  sections.push("\n--- CINEMATOGRAPHY ---");
  
  // Per-clip camera direction (shot type) - takes precedence
  if (clipCameraDirection && SHOT_TYPES[clipCameraDirection]) {
    sections.push(`FRAMING: ${SHOT_TYPES[clipCameraDirection]}`);
  }
  
  // Lens
  const lens = styleGuide?.lens || "50mm";
  sections.push(`LENS: ${LENS_SPECS[lens] || LENS_SPECS["50mm"]}`);
  
  // Camera movement
  const cameraStyle = styleGuide?.camera_style || "documentary";
  sections.push(`CAMERA: ${CAMERA_SPECS[cameraStyle] || CAMERA_SPECS.documentary}`);
  
  // Depth of field
  const dof = styleGuide?.depth_of_field || "medium";
  sections.push(`FOCUS: ${DOF_SPECS[dof] || DOF_SPECS.medium}`);
  
  // Motion style
  const motion = styleGuide?.motion_style || "smooth";
  sections.push(`MOTION: ${MOTION_SPECS[motion] || MOTION_SPECS.smooth}`);
  
  // Lighting section
  sections.push("\n--- LIGHTING ---");
  const lighting = styleGuide?.lighting || "natural";
  sections.push(LIGHTING_SPECS[lighting] || LIGHTING_SPECS.natural);
  
  // Color section
  sections.push("\n--- COLOR & GRADE ---");
  const colorGrade = styleGuide?.color_grade || "neutral";
  sections.push(COLOR_SPECS[colorGrade] || COLOR_SPECS.neutral);
  
  // Film stock
  const filmStock = styleGuide?.film_stock || "digital";
  sections.push(`FILM STOCK: ${FILM_SPECS[filmStock] || FILM_SPECS.digital}`);
  
  // Mood
  if (styleGuide?.mood) {
    sections.push(`\nMOOD: ${styleGuide.mood} emotional tone throughout.`);
  }
  
  // Custom notes
  if (styleGuide?.custom_notes) {
    sections.push(`\nNOTES: ${styleGuide.custom_notes}`);
  }
  
  // Action structure guidance - CRITICAL for controlled motion
  sections.push("\n--- ACTION STRUCTURE ---");
  sections.push("Describe motion in BEATS: setup → action → completion.");
  sections.push("Each beat flows naturally with realistic timing and physics.");
  sections.push("Allow for natural pauses and subtle secondary movements.");
  sections.push("Actions have weight, momentum, and follow-through.");
  
  // Quality directives - POSITIVE FRAMING (moderation-safe)
  sections.push("\n--- QUALITY STANDARDS ---");
  sections.push("MOTION: Natural motion blur with lifelike physics. Smooth 24fps cinematic cadence with realistic momentum.");
  sections.push("ANATOMY: Consistent human proportions throughout. Five fingers per hand. Natural body mechanics.");
  sections.push("FACES: Expressive and engaged. Natural eye movements. Subtle authentic micro-expressions.");
  sections.push("TEMPORAL: Smooth frame interpolation. Consistent velocity and acceleration. Seamless movement flow.");
  sections.push("SPATIAL: Coherent 3D space. Correct perspective. Objects maintain relative positions throughout.");
  sections.push("LIGHTING: Consistent lighting direction. Stable exposure. Smooth color transitions.");
  sections.push("PRODUCTION: Broadcast-quality output. Clean edges. Sharp details. Rich color depth.");
  
  // Continuity directive (critical for chained generation)
  if (!isFirstClip) {
    sections.push("\n--- CONTINUITY DIRECTIVE ---");
    sections.push("CRITICAL: Continue SEAMLESSLY from the reference frame provided.");
    sections.push("SAME person - exact face, body, proportions.");
    sections.push("SAME wardrobe - exact clothing, accessories, colors.");
    sections.push("SAME environment - consistent background, lighting, time of day.");
    sections.push("This is the NEXT shot in a continuous sequence - maintain 100% visual consistency.");
  }
  
  // The actual scene action
  sections.push("\n=== SCENE ACTION ===");
  sections.push(scenePrompt);
  
  return sections.join("\n");
}

/**
 * Build a simplified style prefix for single clip generation
 * (backwards compatible with existing queue-video function)
 * 
 * @deprecated Use buildCinematicPrompt instead for full quality
 */
export function buildStylePrefix(styleGuide: StyleGuideData | null): string {
  if (!styleGuide) return "";
  
  const parts: string[] = ["VISUAL STYLE REQUIREMENTS:"];
  
  if (styleGuide.character) {
    parts.push(`Subject: ${styleGuide.character}`);
  }
  if (styleGuide.wardrobe) {
    parts.push(`Wardrobe: ${styleGuide.wardrobe}`);
  }
  if (styleGuide.location) {
    parts.push(`Location: ${styleGuide.location}`);
  }
  if (styleGuide.lighting && LIGHTING_SPECS[styleGuide.lighting]) {
    parts.push(`Lighting: ${LIGHTING_SPECS[styleGuide.lighting]}`);
  }
  if (styleGuide.camera_style && CAMERA_SPECS[styleGuide.camera_style]) {
    parts.push(`Camera: ${CAMERA_SPECS[styleGuide.camera_style]}`);
  }
  if (styleGuide.color_grade && COLOR_SPECS[styleGuide.color_grade]) {
    parts.push(`Color: ${COLOR_SPECS[styleGuide.color_grade]}`);
  }
  if (styleGuide.mood) {
    parts.push(`Mood: ${styleGuide.mood}`);
  }
  if (styleGuide.custom_notes) {
    parts.push(`Notes: ${styleGuide.custom_notes}`);
  }
  
  if (parts.length <= 1) return "";
  
  return parts.join("\n") + "\n\nSCENE: ";
}

/**
 * Optimal Sora API parameters for maximum quality
 * These should be passed alongside the prompt in FormData
 */
export interface SoraApiParams {
  fps: 24 | 30 | 60;
  aspect_ratio_lock: boolean;
  loop: boolean;
}

export function getOptimalApiParams(loop: boolean = false): SoraApiParams {
  return {
    fps: 24, // Cinematic standard
    aspect_ratio_lock: true, // Prevent internal cropping
    loop, // Seamless looping for ambient clips
  };
}

// Re-export specs for external use if needed
export { LENS_SPECS, CAMERA_SPECS, LIGHTING_SPECS, COLOR_SPECS, DOF_SPECS, MOTION_SPECS, FILM_SPECS, TIME_SPECS };

/**
 * =============================================================================
 * RUNWAY GEN-3 ALPHA PROMPT SYSTEM
 * =============================================================================
 * Runway prefers concise, motion-focused prompts with camera keywords.
 * Less verbose than Sora - focus on action and visual style.
 */

/**
 * Runway-specific camera motion keywords
 */
const RUNWAY_CAMERA_MOTIONS: Record<string, string> = {
  "static": "static shot",
  "tracking": "tracking shot following subject",
  "dolly": "dolly push forward",
  "crane": "crane shot rising",
  "handheld": "handheld camera with subtle movement",
  "pan": "smooth pan",
  "tilt": "tilt up reveal",
  "zoom": "slow zoom in",
};

/**
 * Map our shot types to Runway-friendly descriptions
 */
const RUNWAY_SHOT_MAPPING: Record<string, string> = {
  "extreme-wide": "extreme wide shot, vast environment",
  "wide": "wide shot showing full scene",
  "medium-wide": "medium wide shot, action visible",
  "medium": "medium shot, waist up",
  "medium-close": "medium close-up, chest up",
  "close-up": "close-up on face",
  "extreme-close": "extreme close-up, detail shot",
  "over-shoulder": "over the shoulder perspective",
  "pov": "first person POV",
  "dutch": "dutch angle, tilted frame",
  "low-angle": "low angle looking up",
  "high-angle": "high angle looking down",
  "tracking": "tracking shot following subject",
  "crane": "crane shot with vertical movement",
};

/**
 * Build a Runway-optimized prompt.
 * Runway prefers:
 * - Concise descriptions (under 500 chars ideal)
 * - Camera motion keywords at the start
 * - Clear subject description
 * - Action/motion focus
 * - Minimal technical jargon
 */
export function buildRunwayPrompt(
  styleGuide: StyleGuideData | null,
  scenePrompt: string,
  clipCameraDirection?: string
): string {
  const parts: string[] = [];
  
  // Camera/shot direction first (Runway responds well to this)
  if (clipCameraDirection && RUNWAY_SHOT_MAPPING[clipCameraDirection]) {
    parts.push(RUNWAY_SHOT_MAPPING[clipCameraDirection]);
  } else if (styleGuide?.camera_style && RUNWAY_CAMERA_MOTIONS[styleGuide.camera_style]) {
    parts.push(RUNWAY_CAMERA_MOTIONS[styleGuide.camera_style]);
  }
  
  // Subject/character with key visual details
  if (styleGuide?.character) {
    let subjectDesc = styleGuide.character;
    if (styleGuide.wardrobe) {
      subjectDesc += `, wearing ${styleGuide.wardrobe}`;
    }
    parts.push(subjectDesc);
  }
  
  // Environment/location
  if (styleGuide?.location) {
    parts.push(`in ${styleGuide.location}`);
  }
  
  // Time of day for lighting context
  if (styleGuide?.time_of_day && TIME_SPECS[styleGuide.time_of_day]) {
    parts.push(styleGuide.time_of_day.replace(/_/g, " ") + " lighting");
  }
  
  // The actual scene action (most important)
  parts.push(scenePrompt);
  
  // Mood/style at the end
  if (styleGuide?.mood) {
    parts.push(`${styleGuide.mood} mood`);
  }
  
  // Lighting style
  if (styleGuide?.lighting) {
    const lightingDesc = styleGuide.lighting.replace(/_/g, " ");
    parts.push(`${lightingDesc} lighting`);
  }
  
  // Color grade
  if (styleGuide?.color_grade) {
    const colorDesc = styleGuide.color_grade.replace(/_/g, " ");
    parts.push(`${colorDesc} color grade`);
  }
  
  // Film look
  if (styleGuide?.film_stock && styleGuide.film_stock !== "digital") {
    parts.push(`${styleGuide.film_stock} film look`);
  }
  
  // Quality directive (concise)
  parts.push("cinematic quality, smooth motion, professional production");
  
  // Join with commas for Runway's preferred format
  return parts.filter(Boolean).join(", ");
}

/**
 * =============================================================================
 * LUMA DREAM MACHINE PROMPT SYSTEM
 * =============================================================================
 * Luma Ray2 excels at natural motion and physics.
 * Prompts should emphasize movement and realistic action.
 */

/**
 * Luma-specific camera motion keywords
 */
const LUMA_MOTION_KEYWORDS: Record<string, string> = {
  "static": "static camera",
  "tracking": "camera tracking the subject",
  "dolly": "smooth dolly movement",
  "crane": "crane shot moving upward",
  "handheld": "natural handheld camera movement",
  "pan": "smooth horizontal pan",
  "tilt": "vertical tilt movement",
  "zoom": "gradual zoom",
  "orbit": "camera orbiting around subject",
};

/**
 * Build a Luma-optimized prompt.
 * Luma Ray2 prefers:
 * - Clear motion descriptions
 * - Natural physics emphasis
 * - Concise but descriptive
 * - Environment and atmosphere focus
 */
export function buildLumaPrompt(
  styleGuide: StyleGuideData | null,
  scenePrompt: string,
  clipCameraDirection?: string
): string {
  const parts: string[] = [];
  
  // Camera motion first
  if (clipCameraDirection && LUMA_MOTION_KEYWORDS[clipCameraDirection]) {
    parts.push(LUMA_MOTION_KEYWORDS[clipCameraDirection]);
  } else if (styleGuide?.motion_style && LUMA_MOTION_KEYWORDS[styleGuide.motion_style]) {
    parts.push(LUMA_MOTION_KEYWORDS[styleGuide.motion_style]);
  }
  
  // Subject description
  if (styleGuide?.character) {
    let subjectDesc = styleGuide.character;
    if (styleGuide.wardrobe) {
      subjectDesc += ` wearing ${styleGuide.wardrobe}`;
    }
    parts.push(subjectDesc);
  }
  
  // Environment
  if (styleGuide?.location) {
    parts.push(styleGuide.location);
  }
  
  // The scene action (Luma excels at motion)
  parts.push(scenePrompt);
  
  // Atmosphere/mood
  if (styleGuide?.mood) {
    parts.push(`${styleGuide.mood} atmosphere`);
  }
  
  // Lighting (simplified for Luma)
  if (styleGuide?.lighting) {
    parts.push(`${styleGuide.lighting.replace(/_/g, " ")} lighting`);
  }
  
  // Time of day
  if (styleGuide?.time_of_day) {
    parts.push(styleGuide.time_of_day.replace(/_/g, " "));
  }
  
  // Quality directive - emphasize physics and natural motion
  parts.push("realistic physics, natural motion, high quality, cinematic");
  
  return parts.filter(Boolean).join(", ");
}

/**
 * Build a provider-aware prompt.
 * Single entry point for Sora, Runway, and Luma prompt generation.
 */
export function buildProviderPrompt(
  provider: "sora" | "runway" | "luma",
  styleGuide: StyleGuideData | null,
  scenePrompt: string,
  isFirstClip: boolean,
  clipCameraDirection?: string
): string {
  if (provider === "runway") {
    return buildRunwayPrompt(styleGuide, scenePrompt, clipCameraDirection);
  }
  if (provider === "luma") {
    return buildLumaPrompt(styleGuide, scenePrompt, clipCameraDirection);
  }
  return buildCinematicPrompt(styleGuide, scenePrompt, isFirstClip, clipCameraDirection);
}

/**
 * Continuity prompt addition for chained clips (Runway version)
 * When using image-to-video, add motion guidance
 */
export function buildRunwayContinuityPrompt(
  styleGuide: StyleGuideData | null,
  scenePrompt: string,
  clipCameraDirection?: string
): string {
  const basePrompt = buildRunwayPrompt(styleGuide, scenePrompt, clipCameraDirection);
  
  // Add continuity directive for image-to-video
  return `${basePrompt}, seamlessly continue from the reference image, maintain character consistency, smooth natural motion`;
}

/**
 * Continuity prompt for Luma chained clips
 */
export function buildLumaContinuityPrompt(
  styleGuide: StyleGuideData | null,
  scenePrompt: string,
  clipCameraDirection?: string
): string {
  const basePrompt = buildLumaPrompt(styleGuide, scenePrompt, clipCameraDirection);
  
  return `${basePrompt}, continue seamlessly from the starting frame, maintain visual consistency, smooth transition`;
}
