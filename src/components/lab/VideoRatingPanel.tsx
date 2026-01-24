import { useState } from "react";
import { Star, Save, Loader2, Sparkles } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface VideoRatingPanelProps {
  jobId: string;
  provider: string;
  originalPrompt?: string;
  enrichedPrompt?: string;
  styleHints?: string;
  currentRating?: number;
  currentNotes?: string;
  onRated?: () => void;
  className?: string;
}

export function VideoRatingPanel({
  jobId,
  provider,
  originalPrompt,
  enrichedPrompt,
  styleHints,
  currentRating = 0,
  currentNotes = "",
  onRated,
  className,
}: VideoRatingPanelProps) {
  const { toast } = useToast();
  const [rating, setRating] = useState(currentRating);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [notes, setNotes] = useState(currentNotes);
  const [showPrompts, setShowPrompts] = useState(false);

  const ratingMutation = useMutation({
    mutationFn: async () => {
      // Save rating to video_jobs table
      const { error: updateError } = await supabase
        .from("video_jobs")
        .update({
          accuracy_rating: rating,
          accuracy_notes: notes || null,
          rated_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      if (updateError) throw updateError;

      // Trigger learning analysis if rating is high (4-5)
      if (rating >= 4 && enrichedPrompt) {
        const { error: analyzeError } = await supabase.functions.invoke("analyze-prompt-success", {
          body: {
            job_id: jobId,
            provider,
            enriched_prompt: enrichedPrompt,
            original_prompt: originalPrompt,
            style_hints: styleHints,
            rating,
          },
        });
        
        if (analyzeError) {
          console.error("Learning analysis failed:", analyzeError);
          // Don't throw - rating was still saved
        }
      }

      return { success: true };
    },
    onSuccess: () => {
      toast({
        title: "Rating saved",
        description: rating >= 4 
          ? "Learning from this successful prompt!" 
          : "Feedback recorded",
      });
      onRated?.();
    },
    onError: (error) => {
      toast({
        title: "Failed to save rating",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getRatingLabel = (r: number) => {
    switch (r) {
      case 1: return "Poor match";
      case 2: return "Below average";
      case 3: return "Acceptable";
      case 4: return "Good match";
      case 5: return "Perfect match";
      default: return "Rate accuracy";
    }
  };

  return (
    <div className={cn("p-3 border-t bg-card/50 space-y-3", className)}>
      {/* Rating Header */}
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-primary" />
          Rate Prompt Accuracy
        </Label>
        <span className="text-xs text-muted-foreground">
          {getRatingLabel(hoveredRating || rating)}
        </span>
      </div>

      {/* Star Rating */}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => setRating(star)}
            onMouseEnter={() => setHoveredRating(star)}
            onMouseLeave={() => setHoveredRating(0)}
            className="p-1 transition-transform hover:scale-110"
          >
            <Star
              className={cn(
                "h-6 w-6 transition-colors",
                (hoveredRating || rating) >= star
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-muted-foreground/30"
              )}
            />
          </button>
        ))}
        
        {rating >= 4 && (
          <span className="ml-2 text-xs text-primary font-medium">
            ✨ Will learn from this!
          </span>
        )}
      </div>

      {/* Show prompts toggle */}
      {(originalPrompt || enrichedPrompt) && (
        <button
          onClick={() => setShowPrompts(!showPrompts)}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          {showPrompts ? "Hide prompts" : "Show prompts used"}
        </button>
      )}

      {/* Prompts Display */}
      {showPrompts && (
        <div className="space-y-2 p-2 rounded bg-muted/30 text-xs">
          {originalPrompt && (
            <div>
              <span className="font-medium text-muted-foreground">Original:</span>
              <p className="text-foreground/80">{originalPrompt}</p>
            </div>
          )}
          {enrichedPrompt && (
            <div>
              <span className="font-medium text-muted-foreground">Enriched:</span>
              <p className="text-foreground/80">{enrichedPrompt}</p>
            </div>
          )}
          {styleHints && (
            <div>
              <span className="font-medium text-muted-foreground">Style hints:</span>
              <p className="text-foreground/80">{styleHints}</p>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      {rating > 0 && (
        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
            Notes (optional)
          </Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What worked or didn't work? (helps improve future prompts)"
            className="text-xs min-h-[60px] resize-none bg-secondary/30"
          />
        </div>
      )}

      {/* Save Button */}
      {rating > 0 && (
        <Button
          onClick={() => ratingMutation.mutate()}
          disabled={ratingMutation.isPending}
          size="sm"
          className="w-full"
        >
          {ratingMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Rating
        </Button>
      )}
    </div>
  );
}
