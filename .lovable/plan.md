# Scene-Role Based Provider Routing V2 - IMPLEMENTED

## Summary

Transformed the story generation system from "pick a provider" to **"assign roles to scenes, route each role to the optimal model."**

**Philosophy:**
- **Sora** = Story backbone (coherent, cinematic hero moments)
- **Runway** = Attention mechanics (hooks, brainrot resets, punchy motion)
- **Luma** = Atmosphere/physics (smoke, water, particles, mood glue)

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                    STORY TEMPLATE                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Scene 1: HOOK         │ role: "hook"      │ → Runway   │   │
│  │  Scene 2: PROBLEM      │ role: "problem"   │ → Luma     │   │
│  │  Scene 3: STORY_A      │ role: "story_a"   │ → Sora     │   │
│  │  Scene 4: RESET        │ role: "reset"     │ → Runway   │   │
│  │  Scene 5: STORY_B      │ role: "story_b"   │ → Sora     │   │
│  │  Scene 6: CTA          │ role: "cta"       │ → Luma     │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  SCENE ROLE ROUTER                              │
│  role → { provider, prompt_style, fallback_chain }              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│             PROVIDER-SPECIFIC PROMPT COMPILER                   │
│  (Prompting V2: Runway ~100 chars, Luma ~200, Sora ~600)        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Scene Roles

| Role | Purpose | Default Provider | Fallbacks | Duration |
|------|---------|------------------|-----------|----------|
| `hook` | Pattern interrupt | Runway | Luma → Sora | 2-4s |
| `problem` | Show pain point | Luma | Runway → Sora | 4-6s |
| `story_a` | First narrative beat | Sora | Luma → Runway | 6-8s |
| `reset` | Attention micro-cut | Runway | Luma → Sora | 2-3s |
| `story_b` | Payoff/reveal | Sora | Luma → Runway | 6-10s |
| `cta` | Call to action | Luma | Runway → Sora | 4-6s |
| `atmosphere` | Texture glue | Luma | Runway → Sora | 3-5s |
| `establish` | Wide environment | Sora | Luma → Runway | 4-6s |

---

## Files Created/Modified

### New Files
- `src/types/scene-roles.ts` - Scene role type system with configs
- `src/lib/story-templates.ts` - Pre-defined story templates
- `supabase/functions/_shared/scene-role-router.ts` - Role-to-provider routing

### Modified Files
- `src/lib/continuity-scoring.ts` - Added `SceneRole` type and `role` field to `StoryScene`
- `supabase/functions/generate-storyboard/index.ts` - GPT now assigns roles to scenes
- `supabase/functions/continue-story-chain/index.ts` - Uses role-based routing
- `supabase/functions/generate-story-chained/index.ts` - Uses role-based routing
- `src/components/lab/StoryBuilderPanel.tsx` - Role badges and selector in UI

---

## Tier System

**Volume Tier** (default):
- Sora limited to 1 scene (story_b only)
- Fast iteration, lower cost
- Other story roles fall back to Luma

**Hero Tier** (opt-in):
- Unlimited Sora usage
- Full cinematic treatment
- Used for high-performing concepts

---

## Fallback Ladder

Each role has a fallback chain for reliability:

```
hook/reset: Runway → Luma → Sora
story_*:    Sora → Luma → Runway  
problem:    Luma → Runway → Sora
```

---

## UI Features

- **Role Badge**: Shows role + provider emoji per scene
- **Role Selector**: Dropdown to override auto-assigned role
- **Provider Indicator**: Visual showing which provider will render each scene

---

## Acceptance Checklist

- [x] Storyboard output includes `role` for every scene
- [x] Router chooses provider deterministically from role + tier
- [x] Prompting V2 compiler applied based on provider
- [x] UI shows role badge + provider per scene
- [x] Volume tier enforces Sora scene limit (1)
- [x] Fallback chain defined per role
- [ ] Analytics can report performance by role/provider (future)
