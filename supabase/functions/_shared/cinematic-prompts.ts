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
  
  // Quality directives - CRITICAL for professional output
  sections.push("\n--- QUALITY REQUIREMENTS ---");
  sections.push("Natural motion blur on movement. Lifelike physics and weight. Smooth 24fps cinematic cadence.");
  sections.push("Photorealistic rendering. Accurate anatomy. Consistent proportions frame-to-frame.");
  sections.push("Professional production value. Broadcast quality. No amateur artifacts.");
  
  // AVOID section - Anti-artifact directives (CRITICAL for Sora)
  sections.push("\n--- AVOID (CRITICAL) ---");
  sections.push("NO morphing between poses or body parts. NO limbs changing length.");
  sections.push("NO sudden scene cuts or jump cuts. NO flickering or strobing.");
  sections.push("NO unnatural limb movements or impossible contortions.");
  sections.push("NO uncanny valley facial expressions. NO dead eyes or frozen faces.");
  sections.push("NO temporal artifacts or frame-to-frame inconsistency.");
  sections.push("NO text, logos, watermarks, or UI elements in frame.");
  sections.push("NO extra fingers, merged limbs, or anatomical errors.");
  sections.push("NO sudden lighting changes. NO color banding.");
  
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

// Re-export specs for external use if needed
export { LENS_SPECS, CAMERA_SPECS, LIGHTING_SPECS, COLOR_SPECS, DOF_SPECS, MOTION_SPECS, FILM_SPECS, TIME_SPECS };
