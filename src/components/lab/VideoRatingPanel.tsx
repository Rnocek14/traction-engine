import { useState } from "react";
import { Star, Save, Loader2, Sparkles, Cpu, Info } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { triggerAutoRating } from "@/lib/lab-ratings";

interface VideoRatingPanelProps {
  jobId: string;
  provider: string;
  originalPrompt?: string;
  enrichedPrompt?: string;
  styleHints?: string;
  currentRating?: number;
  currentNotes?: string;
  // Auto-rating data
  autoMatchScore?: number | null;
  autoQualityScore?: number | null;
  autoOverallScore?: number | null;
  autoConfidence?: number | null;
  autoReasons?: string[] | null;
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
  autoMatchScore,
  autoQualityScore,
  autoOverallScore,
  autoConfidence,
  autoReasons,
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

  // Auto-rate mutation
  const autoRateMutation = useMutation({
    mutationFn: () => triggerAutoRating(jobId),
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Auto-rated",
          description: "AI analyzed the video quality",
        });
        onRated?.();
      } else {
        toast({
          title: "Auto-rating failed",
          description: data.error || "Unknown error",
          variant: "destructive",
        });
      }
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

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-success";
    if (score >= 60) return "text-warning";
    return "text-destructive";
  };

  const hasAutoRating = autoOverallScore !== null && autoOverallScore !== undefined;

  return (
    <div className={cn("p-3 border-t bg-card/50 space-y-3", className)}>
      {/* Auto-Rating Display */}
      {hasAutoRating && (
        <div className="p-2.5 rounded-lg bg-muted/50 border border-border/50 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">AI Analysis</span>
              {autoConfidence !== null && (
                <Badge variant="outline" className="text-[9px] h-4">
                  {Math.round((autoConfidence || 0) * 100)}% confidence
                </Badge>
              )}
            </div>
            <span className={cn("text-sm font-bold", getScoreColor(autoOverallScore!))}>
              {autoOverallScore}/100
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="space-y-1">
              <div className="flex justify-between text-muted-foreground">
                <span>Prompt Match</span>
                <span className={getScoreColor(autoMatchScore || 0)}>{autoMatchScore || 0}</span>
              </div>
              <Progress value={autoMatchScore || 0} className="h-1" />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-muted-foreground">
                <span>Visual Quality</span>
                <span className={getScoreColor(autoQualityScore || 0)}>{autoQualityScore || 0}</span>
              </div>
              <Progress value={autoQualityScore || 0} className="h-1" />
            </div>
          </div>

          {autoReasons && autoReasons.length > 0 && (
            <div className="text-[10px] text-muted-foreground">
              <span className="font-medium">Notes: </span>
              {autoReasons.slice(0, 2).join(". ")}
            </div>
          )}
        </div>
      )}

      {/* Auto-Rate Button (if not already auto-rated) */}
      {!hasAutoRating && (
        <Button
          variant="outline"
          size="sm"
          className="w-full h-8 text-xs gap-1.5"
          onClick={() => autoRateMutation.mutate()}
          disabled={autoRateMutation.isPending}
        >
          {autoRateMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Cpu className="h-3.5 w-3.5" />
          )}
          Auto-Rate with AI
        </Button>
      )}

      {/* Human Rating Section */}
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-primary" />
          Your Rating
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-3 w-3 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs max-w-48">Your rating overrides AI scores for learning. Rate high (4-5) for prompts that worked well.</p>
            </TooltipContent>
          </Tooltip>
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
                "h-5 w-5 transition-colors",
                (hoveredRating || rating) >= star
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-muted-foreground/30"
              )}
            />
          </button>
        ))}
        
        {rating >= 4 && (
          <span className="ml-2 text-[10px] text-primary font-medium">
            ✨ Will learn from this!
          </span>
        )}
        {rating <= 2 && rating > 0 && (
          <span className="ml-2 text-[10px] text-destructive font-medium">
            ⚠️ Will avoid these patterns
          </span>
        )}
      </div>

      {/* Show prompts toggle */}
      {(originalPrompt || enrichedPrompt) && (
        <button
          onClick={() => setShowPrompts(!showPrompts)}
          className="text-[10px] text-muted-foreground hover:text-foreground underline"
        >
          {showPrompts ? "Hide prompts" : "Show prompts used"}
        </button>
      )}

      {/* Prompts Display */}
      {showPrompts && (
        <div className="space-y-2 p-2 rounded bg-muted/30 text-[10px]">
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
            placeholder="What worked or didn't work?"
            className="text-xs min-h-[50px] resize-none bg-secondary/30"
          />
        </div>
      )}

      {/* Save Button */}
      {rating > 0 && (
        <Button
          onClick={() => ratingMutation.mutate()}
          disabled={ratingMutation.isPending}
          size="sm"
          className="w-full h-8"
        >
          {ratingMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1.5" />
          )}
          Save Rating
        </Button>
      )}
    </div>
  );
}
