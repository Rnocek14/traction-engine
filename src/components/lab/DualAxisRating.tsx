/**
 * Dual-Axis Rating Component
 * Captures both Match (prompt accuracy) and Preference (subjective taste) ratings
 */

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Sparkles, Target, Heart, Zap } from "lucide-react";

interface DualAxisRatingProps {
  matchRating: number;
  preferenceRating: number;
  onMatchChange: (rating: number) => void;
  onPreferenceChange: (rating: number) => void;
  autoMatchScore?: number | null; // 0-100 from auto-rater
  autoQualityScore?: number | null; // 0-100 from auto-rater
  disabled?: boolean;
  compact?: boolean;
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
  autoMatchScore,
  autoQualityScore,
  disabled = false,
  compact = false,
}: DualAxisRatingProps) {
  const [hoveredMatch, setHoveredMatch] = useState(0);
  const [hoveredPref, setHoveredPref] = useState(0);

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
    </div>
  );
}
