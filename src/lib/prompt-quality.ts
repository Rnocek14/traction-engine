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
 * Suggest concrete alternatives for abstract prompts
 */
export function suggestConcreteAlternative(prompt: string, styleGuide?: {
  character?: string;
  location?: string;
}): string | null {
  const lowerPrompt = prompt.toLowerCase();
  
  // Common abstract-to-concrete mappings
  const mappings: Record<string, string> = {
    "animated dots": "Small glowing particles of light drifting through the air",
    "dots moving": "Tiny specks of light floating gently forward",
    "particles": "Dust motes catching sunlight, drifting slowly",
    "progress bar": "Light gradually spreading across a surface like sunlight moving across a room",
    "loading": "Light slowly filling a space, revealing the environment",
    "transition": "Camera smoothly moving through space",
    "motion graphics": "Natural organic movement in the scene",
    "abstract shapes": "Shadows and light playing across surfaces",
    "geometric pattern": "Architectural details with clean lines and angles",
    "text animation": "Camera focusing on handwritten notes or documents",
    "infographic": "Documents or charts being reviewed on a desk",
    "icon": "A meaningful object that represents the concept",
    "diagram": "Someone studying a document or map",
  };
  
  for (const [abstractTerm, concrete] of Object.entries(mappings)) {
    if (lowerPrompt.includes(abstractTerm)) {
      let suggestion = concrete;
      
      // Incorporate style guide if available
      if (styleGuide?.character) {
        suggestion = `${styleGuide.character} observing ${concrete.toLowerCase()}`;
      }
      if (styleGuide?.location) {
        suggestion += ` in ${styleGuide.location}`;
      }
      
      return suggestion;
    }
  }
  
  return null;
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
