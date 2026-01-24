/**
 * Dual-Axis Rating Component
 * Captures both Match (prompt accuracy) and Preference (subjective taste) ratings
 * Supports keyboard shortcuts: 1-5 for match, Shift+1-5 for preference, Enter to save
 */

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Sparkles, Target, Heart, Zap, Keyboard } from "lucide-react";

interface DualAxisRatingProps {
  matchRating: number;
  preferenceRating: number;
  onMatchChange: (rating: number) => void;
  onPreferenceChange: (rating: number) => void;
  onSave?: () => void; // Callback for Enter key
  autoMatchScore?: number | null; // 0-100 from auto-rater
  autoQualityScore?: number | null; // 0-100 from auto-rater
  disabled?: boolean;
  compact?: boolean;
  enableKeyboard?: boolean; // Enable keyboard shortcuts
}

const MATCH_LABELS = ["Missed", "Partial", "Okay", "Good", "Perfect"];
const MATCH_ICONS = ["❌", "🤷", "👍", "✓✓", "💯"];

const PREF_LABELS = ["Dislike", "Meh", "Fine", "Like", "Love"];
const PREF_ICONS = ["😐", "🙂", "😊", "🤩", "🔥"];

// Convert 0-100 auto score to 1-5 rating
function autoScoreToRating(score: number | null | undefined): number {
  if (score === null || score === undefined) return 0;
  if (score >= 80) return 5;
  if (score >= 60) return 4;
  if (score >= 40) return 3;
  if (score >= 20) return 2;
  return 1;
}

export function DualAxisRating({
  matchRating,
  preferenceRating,
  onMatchChange,
  onPreferenceChange,
  onSave,
  autoMatchScore,
  autoQualityScore,
  disabled = false,
  compact = false,
  enableKeyboard = false,
}: DualAxisRatingProps) {
  const [hoveredMatch, setHoveredMatch] = useState(0);
  const [hoveredPref, setHoveredPref] = useState(0);
  const [showKeyHint, setShowKeyHint] = useState(false);

  // Keyboard shortcut handler
  useEffect(() => {
    if (!enableKeyboard || disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key;
      
      // 1-5 keys for rating
      if (/^[1-5]$/.test(key)) {
        const rating = parseInt(key, 10);
        if (e.shiftKey) {
          // Shift + 1-5 = Preference
          onPreferenceChange(rating);
        } else {
          // 1-5 = Match
          onMatchChange(rating);
        }
        e.preventDefault();
      }
      
      // Enter to save
      if (key === "Enter" && onSave) {
        onSave();
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enableKeyboard, disabled, onMatchChange, onPreferenceChange, onSave]);

  // Suggest ratings from auto-scores if no human rating yet
  const suggestedMatch = autoScoreToRating(autoMatchScore);
  const suggestedPref = autoScoreToRating(autoQualityScore);

  // Determine if this is a serendipity case
  const isSerendipity = matchRating <= 2 && preferenceRating >= 4;
  const isAccurateButDisliked = matchRating >= 4 && preferenceRating <= 2;

  const renderRatingRow = (
    label: string,
    icon: React.ReactNode,
    rating: number,
    hovered: number,
    suggested: number,
    icons: string[],
    labels: string[],
    onChange: (r: number) => void,
    onHover: (r: number) => void
  ) => (
    <div className={cn("space-y-1", compact && "space-y-0.5")}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
        {suggested > 0 && rating === 0 && (
          <span className="text-[10px] text-primary/60 ml-auto">AI suggests: {labels[suggested - 1]}</span>
        )}
      </div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((r) => {
          const isActive = rating >= r;
          const isHovered = hovered >= r;
          const isSuggested = rating === 0 && suggested >= r;
          
          return (
            <TooltipProvider key={r}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(r)}
                    onMouseEnter={() => onHover(r)}
                    onMouseLeave={() => onHover(0)}
                    className={cn(
                      "transition-all duration-150 text-lg",
                      compact ? "w-7 h-7" : "w-8 h-8",
                      "rounded flex items-center justify-center",
                      disabled && "opacity-50 cursor-not-allowed",
                      !disabled && "hover:scale-110 cursor-pointer",
                      isActive && "bg-primary/20",
                      isHovered && !isActive && "bg-muted",
                      isSuggested && !isActive && "opacity-40 ring-1 ring-primary/30"
                    )}
                  >
                    {icons[r - 1]}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {labels[r - 1]}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      {/* Match Rating */}
      {renderRatingRow(
        "Did it match your prompt?",
        <Target className="w-3.5 h-3.5" />,
        matchRating,
        hoveredMatch,
        suggestedMatch,
        MATCH_ICONS,
        MATCH_LABELS,
        onMatchChange,
        setHoveredMatch
      )}

      {/* Preference Rating */}
      {renderRatingRow(
        "How much do you like it?",
        <Heart className="w-3.5 h-3.5" />,
        preferenceRating,
        hoveredPref,
        suggestedPref,
        PREF_ICONS,
        PREF_LABELS,
        onPreferenceChange,
        setHoveredPref
      )}

      {/* Serendipity / Conflict Indicators */}
      {isSerendipity && (
        <div className="flex items-center gap-1.5 text-xs text-warning bg-warning/10 px-2 py-1 rounded">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Happy Accident! Won't affect prompt learning.</span>
        </div>
      )}
      {isAccurateButDisliked && (
        <div className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 px-2 py-1 rounded">
          <Zap className="w-3.5 h-3.5" />
          <span>Accurate but not your vibe — noted for taste learning.</span>
        </div>
      )}

      {/* Keyboard shortcut hints */}
      {enableKeyboard && !disabled && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1 border-t border-border/50">
          <Keyboard className="w-3 h-3" />
          <span><kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[9px]">1-5</kbd> match</span>
          <span><kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[9px]">⇧1-5</kbd> preference</span>
          {onSave && <span><kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[9px]">↵</kbd> save</span>}
        </div>
      )}
    </div>
  );
}
