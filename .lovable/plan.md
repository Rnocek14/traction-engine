# Fix: Story Chain Improvements

## Status: ✅ IMPLEMENTED

---

## Problem 1: Cron Boot Failure (FIXED)

`continue-story-chain` had duplicate imports causing:
```
Identifier 'corsHeaders' has already been declared at line 79:7
```

**Fix:** Removed duplicate import and corsHeaders declaration at lines 98-103.

---

## Problem 2: Dimension Mismatch (IMPLEMENTED)

Story chains were failing at Scene 3+ (Sora) because thumbnails didn't match 720x1280.

**Fix:** Added FFmpeg `/resize` endpoint + dimension detection in chain logic.

---

## Problem 3: Repeated Actions in I2V (IMPLEMENTED)

I2V models repeat the most salient motion from the previous frame when not given explicit progression directives.

**Fix:** Added `progression-injection.ts` module that injects delta directives:
- Uses RAW scene prompts for action extraction (not compiled provider prompts)
- Normalizes `change_type` to valid Director Brain enum values
- Logs `prev_action` and `next_action` for easy debugging
- Warns when `prev_action == next_action` (potential repeat)

**Provider-specific directives:**
- **Sora:** "DIRECTOR NOTE (story progression): Previous action: X (DO NOT repeat)"
- **Runway:** "NEW action: Y. Do not repeat: X."
- **Luma:** "New action: Y. Previous action (X) must not repeat."

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/continue-story-chain/index.ts` | Fixed duplicate import, added progression injection |
| `supabase/functions/_shared/progression-injection.ts` | New module for delta directives |
| `ffmpeg-service/src/resize.ts` | Image resize endpoint |

---

## Validation

After deployment:
- Cron should boot successfully (no more identifier errors)
- Scene 2+ prompts should contain "Do not repeat: [prev_action]"
- Each scene should show different primary actions


