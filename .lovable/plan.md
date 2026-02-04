
# Simplifying Myth Mode Prompts: "Less is More"

## The Core Problem

We're sending **1,400+ character prompts with 16+ directive blocks** to Sora, but research shows:
- **The first 500 characters carry 80% of the weight** — Sora prioritizes the beginning
- After ~1,000 characters, models experience **"semantic drift"** and start forgetting earlier instructions
- We're giving equal weight to everything, so **nothing stands out**

Meanwhile, the actual "Tale of Three Brothers" that inspired Myth Mode used an **extremely focused aesthetic**:
- Silhouettes expressing emotion through body pose only
- "Pulsing light" — the single most distinctive visual element
- Layers of paper with independent motion (parallax)
- Naive, graphical, simple — NOT instruction-dense

## Current Prompt Structure (Too Complex)

```text
[STYLE: ...] 
[PALETTE: ...]
REALM: ...
[LAYERS: ...]
[LIGHT: ...]
[CAMERA: ...]
[TEMPO: ...]
SILHOUETTE: ...
SYMBOL: ...
SCENE: ...
[DELTA: ...]
[ENVIRONMENT: ...]
[SYMBOL STATE: ...]
[MOTION: ...]
[ATMOSPHERE: ...]
[AVOID: ...]
```

That's **16 competing directive blocks**. Sora can't prioritize when everything screams "important."

## The Fix: Radical Simplification

### New "Essence First" Prompt Structure

Put the **single most important visual idea** in the first 150 characters. Everything else is supporting context.

```text
SINGLE SHOT: [One vivid sentence describing the action]

STYLE: Shadow-puppet silhouette, parchment texture, pulsing warm light

[Then 2-3 supporting details if needed]
```

### What to Keep (High-Impact)

| Directive | Why It Matters |
|-----------|----------------|
| **The Scene Action** | This IS the video — what happens |
| **STYLE anchor** | "Shadow-puppet silhouette" is the aesthetic |
| **Light behavior** | "Pulsing warm light" = the Three Brothers magic |
| **One motion verb** | A single physical action the figure performs |

### What to Consolidate or Remove

| Current Block | Problem | Solution |
|---------------|---------|----------|
| `[LAYERS]` + `[ATMOSPHERE]` | Competing parallax instructions | Merge into STYLE |
| `[TEMPO]` + `[MOTION]` | Both describe pacing | Pick one, remove other |
| `[DELTA]` + `[SYMBOL STATE]` | Redundant with scene description | Fold into action line |
| `[CAMERA]` | Often ignored by model | Move to end or remove |
| `[AVOID]` | 50+ characters of negatives | Keep minimal or drop |

## Proposed New Prompt Builder

### Phase 1: The "Essence First" Format

```typescript
export function buildMythPromptSimplified(
  scene: MythScene,
  storyboard: Partial<MythStoryboard>
): string {
  // 1. THE ACTION (first 200 chars — highest priority)
  const action = buildActionLine(scene, storyboard);
  
  // 2. STYLE ANCHOR (next 100 chars)
  const style = "STYLE: Shadow-puppet silhouette, parchment texture, pulsing warm light, high contrast";
  
  // 3. ONE MOTION DIRECTIVE (optional, 50 chars)
  const motion = getSimpleMotion(scene.beat_type);
  
  // 4. AVOID (minimal, end of prompt)
  const avoid = "No faces, no 3D, no modern elements";
  
  return `${action}\n\n${style}\n\n${motion}\n\n${avoid}`;
}

function buildActionLine(scene: MythScene, storyboard: Partial<MythStoryboard>): string {
  const character = storyboard.character?.archetype || "figure";
  const symbol = storyboard.character?.symbol || "";
  
  // Combine scene action + transformation into ONE vivid sentence
  // Example: "A financier lunges for scattering coins as golden light fades to shadow"
  return `${character} ${scene.silhouette_action}. ${scene.start_state} transforms to ${scene.end_state}.`;
}
```

### Example: Old vs New

**Old (1,400 chars):**
```text
[STYLE: flat silhouette animation, shadow-puppet, parchment texture, 2D cutout, high contrast, storybook illustration]
[PALETTE: amber, charcoal, parchment, gold]
REALM: ancient market city, parchment texture
[LAYERS:
  FOREGROUND: scattered coins drift slowly past camera
  MIDGROUND: silhouette figure performing action
  BACKGROUND: ancient market city with slow independent motion...]
[LIGHT: light gradually intensifies from darkness...]
[CAMERA: slow push in from wide to medium...]
[TEMPO: Measured and slow. Each action has weight...]
SILHOUETTE: financier — enters center stage, raising pouch high...
SYMBOL: pouch of coins
SCENE: The financier enters, his pouch gleaming...
[DELTA: Start with "figure enters, pouch full" → End with "figure stands, pouch held aloft"]
[ENVIRONMENT: market stalls BUZZ around; light SHIFTS...]
[SYMBOL STATE: Scene 0: Pouch full, coins glinting...]
[MOTION: figure emerges from shadow, first movement reveals form...]
[ATMOSPHERE: parchment texture subtly crinkles and shifts]
[AVOID: photorealistic, detailed face, eyes, 3D, modern elements, static poses, frozen figures]
```

**New (~400 chars):**
```text
A financier silhouette emerges from shadow, raising a pouch of coins high as golden light intensifies. Market stalls hum in background layers. He stands triumphant, coins gleaming — then begins to lower his arm as the first coin slips free.

STYLE: Shadow-puppet silhouette, parchment paper layers, warm pulsing light, high contrast black and gold

No faces, no 3D, no modern elements.
```

## Technical Changes

### File: `supabase/functions/_shared/myth-continuity.ts`

1. Create new `buildMythPromptSimplified()` function
2. Keep old `buildMythPrompt()` for A/B testing comparison
3. Add flag in `create-story-myth-mode` to choose version

### File: `supabase/functions/continue-story-myth-mode/index.ts`

1. Use simplified prompt builder by default
2. Log prompt length to verify reduction

### Testing Strategy

1. Create new Myth Mode story with simplified prompts
2. Compare side-by-side with existing "Shadow of Vanishing Wealth"
3. Metrics to evaluate:
   - Does light actually pulse/change?
   - Are silhouette poses distinct?
   - Is there visible parallax?
   - Does the scene have transformation (start ≠ end)?

## Expected Outcome

| Metric | Before | After |
|--------|--------|-------|
| Prompt length | 1,400 chars | ~400 chars |
| Directive blocks | 16 | 3-4 |
| First 500 chars | Fragmented | Complete action + style |
| Model focus | Scattered | Unified on action + aesthetic |

## The "Tale of Three Brothers" Lesson

Ben Hibon (the director) said the magic was:
> "Expressing everything with hands, heads, and body positions... pulsing light... the quality and texture of the canvas"

Three things. Not sixteen. We need to **trust the model** to interpret a vivid scene description rather than micromanaging every technical parameter.

---

## Summary

**Problem**: We over-engineered the prompts. 16 directive blocks = nothing stands out.

**Solution**: Radically simplify to 3-4 elements:
1. One vivid action sentence (first 200 chars)
2. Core style anchor (shadow-puppet, pulsing light)
3. One motion/transformation hint
4. Minimal negative constraints

**Inspiration**: The actual Three Brothers animation was simple, naïve, graphical — and magical precisely because of its constraints, not its complexity.
