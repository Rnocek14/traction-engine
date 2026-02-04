

# Lotte Reiniger Style Anchoring: Technique-Based Prompts

## The Problem

Current prompts describe the **aesthetic** ("shadow-puppet silhouette, parchment texture") but Sora interprets this as:
- A backlit 3D figure (not an articulated 2D puppet)
- Smooth, cinematic motion (not handcrafted puppet animation)
- Generic "silhouette look" (not the distinctive Reiniger style)

## The Insight from Reiniger's Own Words (1936)

From BFI's archive of Lotte Reiniger explaining her technique:

> "Instead of using drawings, **silhouette marionettes** are used. These marionettes are cut out of black cardboard and thin lead, **every limb being cut separately and joined with wire hinges**."

> "Figures and backgrounds are laid out on a glass table. A strong light from underneath makes **the wire hinges disappear** and throws up the black figures in relief, while the background appears as a more or less **fantastic landscape in keeping with the story**."

> "The **backgrounds for the characters are cut out with scissors** as well, and designed to give a unified style to the whole picture. They are **cut from layers of transparent paper**."

**Key technical traits:**
1. **Articulated limbs** with visible joints (even if hinges are hidden, the movement is joint-based)
2. **Multiple paper layers** at different depths
3. **Backlighting** from below (not side-lighting)
4. **Frame-by-frame jerky motion** (not smooth)
5. **Flat 2D figures** moving in a 2.5D layered space

## The Technical Pivot

Instead of describing the *look*, describe the *animation technique*. This triggers different model behaviors:

| Current (Aesthetic) | New (Technique) |
|---------------------|-----------------|
| "Shadow-puppet silhouette" | "Lotte Reiniger articulated cutout animation" |
| "Parchment texture" | "Layered transparent paper backgrounds lit from below" |
| "High contrast black and gold" | "Black cardboard figures against backlit colored gels" |
| "Warm pulsing light" | "Light intensity breathes slowly, shadows deepen and lift" |

## Proposed New Style Anchor (V2)

```
STYLE: Lotte Reiniger articulated paper cutout animation, 1920s German silhouette film style. Black cardboard figures with jointed limbs moving against layered transparent paper backgrounds. Backlit from below. Handcrafted frame-by-frame motion.
```

**Key additions:**
1. **"Lotte Reiniger"** - Named style trigger (like "Studio Ghibli")
2. **"articulated"** - Forces joint-based movement
3. **"1920s German silhouette film"** - Historical/technique anchor
4. **"jointed limbs"** - Explicit body articulation
5. **"layered transparent paper"** - Parallax depth structure
6. **"backlit from below"** - Correct lighting direction
7. **"frame-by-frame motion"** - Stop-motion cadence, not smooth

## Updated Prompt Structure (V2)

```typescript
function buildMythPromptV2(scene: MythScene, storyboard: Partial<MythStoryboard>): string {
  // 1. ACTION FIRST (200 chars max)
  const actionLine = buildActionLine(scene, storyboard);
  
  // 2. TECHNIQUE ANCHOR (not aesthetic)
  const techniqueLine = "STYLE: Lotte Reiniger articulated paper cutout animation. " +
    "Black cardboard jointed figures against layered transparent paper. " +
    "Backlit from below. Frame-by-frame handcrafted motion.";
  
  // 3. LIGHT BEHAVIOR (breathing, not static)
  const lightLine = getLightBehavior(scene.beat_type);
  
  // 4. MINIMAL NEGATIVES
  const avoid = "No 3D rendering, no smooth interpolation, no realistic faces.";
  
  return `${actionLine}\n\n${techniqueLine}\n\n${lightLine}\n\n${avoid}`;
}
```

## Light Behavior Per Beat

| Beat | Light Directive |
|------|-----------------|
| introduction | "Light breathes from darkness, intensity slowly rises" |
| journey | "Shadows shift as unseen light source travels across" |
| trial | "Light flickers erratically, contrast sharpens" |
| revelation | "Sudden light bloom, illumination spreads outward" |
| consequence | "Light drains away, figure dissolves at edges" |
| moral | "Soft glow settles, peace in final stillness" |

## Example: Old vs New

**Current (V1) ~500 chars:**
```
A clockmaker silhouette with brass gear reaches into mechanisms. Ancient workshop stretches behind in paper layers.

STYLE: Shadow-puppet silhouette, parchment paper texture, warm pulsing light, high contrast black and gold.

Figure emerges slowly from darkness, first movement deliberate.

No faces, no 3D, no modern elements.
```

**Proposed (V2) ~450 chars:**
```
A clockmaker with jointed articulated limbs reaches into a great clock's mechanisms. Gears turn in separate paper layers behind. His arm bends at elbow and wrist joints as fingers grasp a spinning cog.

STYLE: Lotte Reiniger articulated paper cutout animation. Black cardboard jointed figures against layered transparent paper. Backlit from below. Frame-by-frame handcrafted motion.

Light breathes slowly brighter as the clock awakens.

No 3D, no smooth motion, no faces.
```

## Implementation Files

### File 1: `supabase/functions/_shared/myth-continuity.ts`

1. Create new `buildMythPromptV2()` function with Reiniger technique anchors
2. Add `LIGHT_BEHAVIOR_SIMPLE` map for beat-specific light phrases
3. Keep `buildMythPromptSimplified()` for comparison/fallback
4. Export both for A/B testing capability

### File 2: `supabase/functions/continue-story-myth-mode/index.ts`

1. Switch from `buildMythPromptSimplified` to `buildMythPromptV2`
2. Log version identifier in console for tracking
3. Update `style_hints` to include `prompt_version: "v2_reiniger"`

### File 3: `supabase/functions/create-story-myth-mode/index.ts`

1. Update `generation_settings` to include `prompt_version: "v2"`
2. Add `technique_style: "reiniger"` flag

## Testing Strategy

1. Create a new Myth Mode story with the clockmaker premise
2. Compare side-by-side with existing Clockmaker's Paradox (V1)
3. Metrics to evaluate:
   - Are limbs visibly articulated (bending at joints)?
   - Is there multi-layer parallax?
   - Is motion jerky/handcrafted vs smooth?
   - Does light breathe/pulse visibly?

## Expected Improvements

| Aspect | V1 (Current) | V2 (Reiniger) |
|--------|--------------|---------------|
| Style anchor | Aesthetic description | Technique + named artist |
| Limb articulation | "silhouette" (smooth) | "jointed limbs" (articulated) |
| Lighting direction | Unspecified | "Backlit from below" |
| Motion quality | Smooth/cinematic | "Frame-by-frame handcrafted" |
| Layer behavior | Implicit | "Layered transparent paper" |

## Technical Details

### New Constants

```typescript
const REINIGER_TECHNIQUE_ANCHOR = 
  "STYLE: Lotte Reiniger articulated paper cutout animation. " +
  "Black cardboard jointed figures against layered transparent paper. " +
  "Backlit from below. Frame-by-frame handcrafted motion.";

const LIGHT_BEHAVIOR_SIMPLE: Record<string, string> = {
  introduction: "Light breathes from darkness, intensity slowly rises.",
  journey: "Shadows shift as unseen light source travels across scene.",
  trial: "Light flickers erratically, contrast sharpens and softens.",
  revelation: "Sudden light bloom, illumination spreads outward.",
  consequence: "Light drains slowly away, figure dissolves at edges.",
  moral: "Soft golden glow settles, peace in final stillness.",
};
```

### buildMythPromptV2 Function

```typescript
export function buildMythPromptV2(
  scene: MythScene,
  storyboard: Partial<MythStoryboard>
): string {
  const character = storyboard.character;
  const setting = storyboard.setting;
  
  // 1. ACTION with articulation hints
  const archetype = character?.archetype || "solitary figure";
  const action = scene.silhouette_action || scene.visual_description || "moves through the scene";
  
  // Add articulation hint to action
  const articulatedAction = addArticulationHints(action);
  
  let transformPhrase = "";
  if (scene.start_state && scene.end_state) {
    const truncateClean = (s: string, max: number) => {
      if (s.length <= max) return s;
      const cut = s.slice(0, max);
      const lastSpace = cut.lastIndexOf(' ');
      return lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
    };
    transformPhrase = `. From ${truncateClean(scene.start_state, 45)} to ${truncateClean(scene.end_state, 45)}`;
  }
  
  const actionLine = `A ${archetype} with jointed articulated limbs ${articulatedAction}${transformPhrase}.`;
  
  // 2. SETTING with layer language
  const realm = setting?.realm || "timeless realm";
  const settingLine = `${realm} rendered in separate paper layers behind.`;
  
  // 3. TECHNIQUE ANCHOR (Reiniger-specific)
  const techniqueLine = REINIGER_TECHNIQUE_ANCHOR;
  
  // 4. LIGHT BEHAVIOR (breathing, per beat)
  const lightLine = LIGHT_BEHAVIOR_SIMPLE[scene.beat_type] || LIGHT_BEHAVIOR_SIMPLE.journey;
  
  // 5. MINIMAL NEGATIVES (technique-focused)
  const avoidLine = "No 3D rendering, no smooth interpolation, no realistic faces.";
  
  return `${actionLine} ${settingLine}

${techniqueLine}

${lightLine}

${avoidLine}`;
}

function addArticulationHints(action: string): string {
  // Add body-part-specific motion hints if not present
  if (action.includes("reaches") && !action.includes("arm") && !action.includes("hand")) {
    return action.replace("reaches", "reaches with jointed arm");
  }
  if (action.includes("walks") && !action.includes("leg")) {
    return action.replace("walks", "walks with articulated legs stepping");
  }
  if (action.includes("turns") && !action.includes("head") && !action.includes("body")) {
    return action.replace("turns", "turns at the waist, head following");
  }
  return action;
}
```

## Summary

The V1 prompts describe what the video *looks like*. The V2 prompts describe *how it was made*. By invoking Lotte Reiniger by name and describing the actual physical technique (cardboard cutouts, wire hinges, backlit table), we trigger the model's knowledge of this specific animation style rather than generic "silhouette" interpretation.

