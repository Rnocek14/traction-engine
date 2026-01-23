/**
 * Prompt Quality Analysis
 * Detects weak/abstract prompts and provides enrichment suggestions
 */

/**
 * Keywords that indicate abstract/non-photorealistic content
 */
const ABSTRACT_KEYWORDS = [
  "animated",
  "animation",
  "graphic",
  "graphics",
  "motion graphics",
  "infographic",
  "diagram",
  "chart",
  "icon",
  "logo",
  "cartoon",
  "2d",
  "3d",
  "illustration",
  "vector",
  "wireframe",
  "ui",
  "interface",
  "abstract",
  "geometric",
  "pattern",
  "shape",
  "circle",
  "square",
  "dots",
  "lines",
  "arrows",
  "text overlay",
  "typography",
  "particle",
  "particles",
];

/**
 * Subject indicators for well-anchored prompts
 */
const SUBJECT_INDICATORS = [
  "person",
  "man",
  "woman",
  "child",
  "hands",
  "face",
  "eyes",
  "figure",
  "silhouette",
  "character",
  "protagonist",
  "subject",
  "model",
  "actor",
  "somebody",
  "someone",
  "individual",
  "human",
  "body",
  "portrait",
  "closeup",
  "close-up",
];

/**
 * Action verbs that indicate clear motion
 */
const ACTION_VERBS = [
  "walking",
  "running",
  "sitting",
  "standing",
  "talking",
  "speaking",
  "looking",
  "watching",
  "reading",
  "writing",
  "holding",
  "reaching",
  "moving",
  "turning",
  "smiling",
  "laughing",
  "typing",
  "cooking",
  "eating",
  "drinking",
  "working",
  "playing",
  "dancing",
  "driving",
  "swimming",
  "climbing",
  "jumping",
  "lifting",
  "carrying",
  "opening",
  "closing",
  "touching",
  "pointing",
  "gesturing",
];

/**
 * Environment indicators
 */
const ENVIRONMENT_INDICATORS = [
  "room",
  "office",
  "kitchen",
  "bedroom",
  "bathroom",
  "living room",
  "street",
  "park",
  "forest",
  "beach",
  "ocean",
  "mountain",
  "city",
  "building",
  "house",
  "apartment",
  "studio",
  "outdoors",
  "indoors",
  "exterior",
  "interior",
  "landscape",
  "scenery",
  "background",
];

export interface PromptQualityResult {
  /** Overall score 0-100 */
  score: number;
  /** Whether prompt is likely abstract/non-photorealistic */
  isAbstract: boolean;
  /** Abstract keywords found */
  abstractKeywords: string[];
  /** Whether prompt has a clear subject */
  hasSubject: boolean;
  /** Whether prompt has clear action/motion */
  hasAction: boolean;
  /** Whether prompt has environmental context */
  hasContext: boolean;
  /** Quality level: excellent, good, fair, poor */
  level: "excellent" | "good" | "fair" | "poor";
  /** Issues found */
  issues: string[];
  /** Suggestions for improvement */
  suggestions: string[];
}

/**
 * Analyze prompt quality for video generation
 */
export function analyzePromptQuality(prompt: string): PromptQualityResult {
  const lowerPrompt = prompt.toLowerCase();
  const issues: string[] = [];
  const suggestions: string[] = [];
  
  // Check for abstract keywords
  const foundAbstract = ABSTRACT_KEYWORDS.filter(kw => 
    lowerPrompt.includes(kw.toLowerCase())
  );
  const isAbstract = foundAbstract.length > 0;
  
  if (isAbstract) {
    issues.push(`Abstract content detected: ${foundAbstract.join(", ")}`);
    suggestions.push("Replace abstract elements with concrete visual descriptions");
  }
  
  // Check for subject
  const hasSubject = SUBJECT_INDICATORS.some(s => 
    lowerPrompt.includes(s.toLowerCase())
  );
  
  if (!hasSubject) {
    issues.push("No clear subject/character detected");
    suggestions.push("Add a subject description (e.g., 'A person...', 'Hands...')");
  }
  
  // Check for action
  const hasAction = ACTION_VERBS.some(v => 
    lowerPrompt.includes(v.toLowerCase())
  );
  
  if (!hasAction && !isAbstract) {
    issues.push("No clear action/motion detected");
    suggestions.push("Add an action verb (e.g., 'walking', 'looking', 'reaching')");
  }
  
  // Check for context
  const hasContext = ENVIRONMENT_INDICATORS.some(e => 
    lowerPrompt.includes(e.toLowerCase())
  );
  
  // Calculate score
  let score = 40; // Base score
  
  if (isAbstract) score -= 30;
  if (hasSubject) score += 25;
  if (hasAction) score += 20;
  if (hasContext) score += 15;
  
  // Length bonus (not too short, not too long)
  const wordCount = prompt.split(/\s+/).length;
  if (wordCount >= 5 && wordCount <= 50) {
    score += 10;
  } else if (wordCount < 5) {
    issues.push("Prompt is too short");
    suggestions.push("Add more descriptive details (aim for 10-30 words)");
  }
  
  // Clamp score
  score = Math.max(0, Math.min(100, score));
  
  // Determine level
  let level: PromptQualityResult["level"];
  if (score >= 80) level = "excellent";
  else if (score >= 60) level = "good";
  else if (score >= 40) level = "fair";
  else level = "poor";
  
  return {
    score,
    isAbstract,
    abstractKeywords: foundAbstract,
    hasSubject,
    hasAction,
    hasContext,
    level,
    issues,
    suggestions,
  };
}

/**
 * Get a color class based on quality level
 */
export function getQualityColor(level: PromptQualityResult["level"]): string {
  switch (level) {
    case "excellent": return "text-success";
    case "good": return "text-primary";
    case "fair": return "text-warning";
    case "poor": return "text-destructive";
  }
}

/**
 * Get a background color class based on quality level
 */
export function getQualityBgColor(level: PromptQualityResult["level"]): string {
  switch (level) {
    case "excellent": return "bg-success/20";
    case "good": return "bg-primary/20";
    case "fair": return "bg-warning/20";
    case "poor": return "bg-destructive/20";
  }
}

/**
 * Shot type keywords for auto-detecting camera direction
 */
const SHOT_TYPE_KEYWORDS: Record<string, string[]> = {
  "extreme-close": ["eyes", "lips", "detail", "texture", "fingerprint", "iris", "pore"],
  "close-up": ["face", "hands", "expression", "emotion", "portrait", "closeup", "close-up", "fingers"],
  "medium-close": ["upper body", "torso", "bust", "shoulder"],
  "medium": ["waist", "sitting", "desk", "table", "conversation"],
  "medium-wide": ["full body", "standing", "walking", "gesture"],
  "wide": ["room", "space", "environment", "establishing", "landscape", "scenery", "vista"],
  "extreme-wide": ["aerial", "drone", "panorama", "cityscape", "horizon"],
  "tracking": ["following", "walking with", "moving with", "chase", "pursuit"],
  "pov": ["first person", "from perspective", "through eyes", "looking at"],
  "over-shoulder": ["conversation", "dialogue", "talking to", "facing"],
  "low-angle": ["powerful", "imposing", "heroic", "looking up"],
  "high-angle": ["vulnerable", "small", "looking down", "overhead"],
};

/**
 * Suggest a camera direction based on prompt content
 */
export function suggestCameraDirection(prompt: string): string | undefined {
  const lowerPrompt = prompt.toLowerCase();
  
  // Check each shot type for matching keywords
  for (const [shotType, keywords] of Object.entries(SHOT_TYPE_KEYWORDS)) {
    if (keywords.some(kw => lowerPrompt.includes(kw))) {
      return shotType;
    }
  }
  
  // Default suggestions based on content type
  if (lowerPrompt.includes("person") || lowerPrompt.includes("someone")) {
    return "medium";
  }
  
  return undefined;
}

/**
 * Auto-assign camera directions to all clips that don't have one
 */
export function autoAssignCameraDirections(
  clips: Array<{ id: string; prompt?: string; camera_direction?: string }>
): Array<{ clipId: string; suggestedDirection: string }> {
  const suggestions: Array<{ clipId: string; suggestedDirection: string }> = [];
  
  for (const clip of clips) {
    if (clip.camera_direction) continue; // Already has one
    if (!clip.prompt) continue;
    
    const suggested = suggestCameraDirection(clip.prompt);
    if (suggested) {
      suggestions.push({ clipId: clip.id, suggestedDirection: suggested });
    } else {
      // Default fallback based on position
      suggestions.push({ clipId: clip.id, suggestedDirection: "medium" });
    }
  }
  
  return suggestions;
}

/**
 * Concretization mappings: abstract concept -> photorealistic description
 */
const CONCRETIZATION_MAP: Record<string, string> = {
  // Motion graphics/animations
  "animated dots": "Small glowing particles of light drifting gently through the air",
  "dots moving": "Tiny specks of dust catching sunlight, floating slowly forward",
  "particles moving": "Dust motes suspended in a beam of light, drifting peacefully",
  "particle effect": "Natural dust and light playing in the air",
  "motion graphics": "Organic, natural movement in the environment",
  "abstract animation": "Shadows and light dancing across surfaces",
  
  // Progress/loading
  "progress bar": "Sunlight slowly spreading across a desk surface as time passes",
  "loading animation": "Light gradually filling a room through a window",
  "loading screen": "A patient moment of stillness, waiting",
  "countdown": "Clock hands moving, time passing visibly",
  
  // UI/Tech
  "screen recording": "A person's face illuminated by a computer screen",
  "interface": "Hands typing on a keyboard, screen reflected in glasses",
  "app interface": "A phone held in hands, face lit by the screen glow",
  "dashboard": "Control panels and screens in a modern workspace",
  "data visualization": "Charts and documents spread across a desk",
  
  // Transitions
  "transition": "Camera movement through the space",
  "fade": "Light gradually changing in the scene",
  "wipe": "Movement across the frame revealing the next moment",
  
  // Abstract shapes
  "geometric shapes": "Architectural details with clean lines and sharp angles",
  "abstract shapes": "Shadows cast by window blinds creating patterns",
  "geometric pattern": "Tiles, brickwork, or architectural elements with repeating forms",
  "circles": "Rounded objects like plates, clocks, or wheels",
  "lines": "Power lines, horizon lines, or architectural edges",
  
  // Text/graphics
  "text animation": "Handwritten notes on paper, pen moving across page",
  "text overlay": "Written words visible on documents or signs in the scene",
  "typography": "Signage, book spines, or handwritten text",
  "infographic": "Documents, charts, or notes spread on a surface",
  "diagram": "Technical drawings or blueprints being studied",
  "icon": "A symbolic object that represents the concept",
  
  // Generic abstract
  "abstract": "Atmospheric, moody environmental shot",
  "conceptual": "A visual metaphor through real objects and environments",
};

/**
 * Concretize an abstract prompt into a photorealistic description
 */
export function concretizePrompt(
  prompt: string,
  styleGuide?: {
    character?: string;
    location?: string;
    wardrobe?: string;
  }
): { concretized: string; wasModified: boolean } {
  let result = prompt;
  let wasModified = false;
  const lowerPrompt = prompt.toLowerCase();
  
  // Find and replace abstract terms
  for (const [abstractTerm, concrete] of Object.entries(CONCRETIZATION_MAP)) {
    if (lowerPrompt.includes(abstractTerm.toLowerCase())) {
      // Replace the abstract term with the concrete description
      const regex = new RegExp(abstractTerm, "gi");
      result = result.replace(regex, concrete);
      wasModified = true;
    }
  }
  
  // If modified and we have a style guide, enhance further
  if (wasModified && styleGuide) {
    const parts: string[] = [];
    
    if (styleGuide.character && !result.toLowerCase().includes(styleGuide.character.toLowerCase().slice(0, 10))) {
      parts.push(styleGuide.character);
      if (styleGuide.wardrobe) {
        parts.push(`wearing ${styleGuide.wardrobe}`);
      }
      parts.push("observing");
    }
    
    parts.push(result);
    
    if (styleGuide.location && !result.toLowerCase().includes(styleGuide.location.toLowerCase().slice(0, 10))) {
      parts.push(`in ${styleGuide.location}`);
    }
    
    result = parts.join(" ");
  }
  
  return { concretized: result.trim(), wasModified };
}

/**
 * Suggest concrete alternatives for abstract prompts
 */
export function suggestConcreteAlternative(prompt: string, styleGuide?: {
  character?: string;
  location?: string;
}): string | null {
  const { concretized, wasModified } = concretizePrompt(prompt, styleGuide);
  return wasModified ? concretized : null;
}

/**
 * Build an enhanced prompt from a basic prompt and style guide
 */
export function enhancePrompt(
  prompt: string,
  styleGuide?: {
    character?: string;
    location?: string;
    wardrobe?: string;
    props?: string;
  }
): string {
  if (!styleGuide || (!styleGuide.character && !styleGuide.location)) {
    return prompt;
  }
  
  const parts: string[] = [];
  
  // Add subject if missing
  const hasSubject = SUBJECT_INDICATORS.some(s => 
    prompt.toLowerCase().includes(s.toLowerCase())
  );
  
  if (!hasSubject && styleGuide.character) {
    parts.push(styleGuide.character);
    if (styleGuide.wardrobe) {
      parts.push(`wearing ${styleGuide.wardrobe}`);
    }
  }
  
  // Add the original prompt
  parts.push(prompt);
  
  // Add location if not present
  const hasLocation = ENVIRONMENT_INDICATORS.some(e => 
    prompt.toLowerCase().includes(e.toLowerCase())
  );
  
  if (!hasLocation && styleGuide.location) {
    parts.push(`in ${styleGuide.location}`);
  }
  
  // Add props if relevant
  if (styleGuide.props && !prompt.toLowerCase().includes(styleGuide.props.toLowerCase())) {
    parts.push(`with ${styleGuide.props}`);
  }
  
  return parts.join(", ");
}
