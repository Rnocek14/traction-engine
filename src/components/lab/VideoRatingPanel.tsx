import { useState } from "react";
import { Save, Loader2, Sparkles, Cpu, Info } from "lucide-react";
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
import { DualAxisRating } from "./DualAxisRating";

interface VideoRatingPanelProps {
  jobId: string;
  provider: string;
  originalPrompt?: string;
  enrichedPrompt?: string;
  styleHints?: string;
  // Legacy single rating (for backwards compat display)
  currentRating?: number;
  currentNotes?: string;
  // Dual-axis ratings
  humanMatchRating?: number | null;
  humanPreferenceRating?: number | null;
  isSerendipity?: boolean | null;
  // Auto-rating data
  autoMatchScore?: number | null;
  autoQualityScore?: number | null;
  autoMotionScore?: number | null;
  autoCinematicScore?: number | null;
  autoOverallScore?: number | null;
  autoConfidence?: number | null;
  autoReasons?: string[] | null;
  autoArtifactFlags?: string[] | null;
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
  humanMatchRating,
  humanPreferenceRating,
  isSerendipity: currentSerendipity,
  autoMatchScore,
  autoQualityScore,
  autoMotionScore,
  autoCinematicScore,
  autoOverallScore,
  autoConfidence,
  autoReasons,
  autoArtifactFlags,
  onRated,
  className,
}: VideoRatingPanelProps) {
  const { toast } = useToast();
  
  // Dual-axis state
  const [matchRating, setMatchRating] = useState(humanMatchRating ?? 0);
  const [preferenceRating, setPreferenceRating] = useState(humanPreferenceRating ?? 0);
  const [notes, setNotes] = useState(currentNotes);
  const [showPrompts, setShowPrompts] = useState(false);

  const hasRatings = matchRating > 0 && preferenceRating > 0;

  const ratingMutation = useMutation({
    mutationFn: async () => {
      // Determine serendipity flag
      const isSerendipity = matchRating <= 2 && preferenceRating >= 4;
      
      // Save dual-axis ratings to video_jobs table
      // accuracy_rating syncs with matchRating to preserve semantic meaning
      const { error: updateError } = await supabase
        .from("video_jobs")
        .update({
          human_match_rating: matchRating,
          human_preference_rating: preferenceRating,
          is_serendipity: isSerendipity,
          accuracy_notes: notes || null,
          rated_at: new Date().toISOString(),
          human_rating_override: true,
          // Legacy field syncs with match (accuracy = prompt match)
          accuracy_rating: matchRating,
        })
        .eq("id", jobId);

      if (updateError) throw updateError;

      // Trigger learning analysis with dual-axis ratings
      if (enrichedPrompt) {
        const { data, error: analyzeError } = await supabase.functions.invoke("analyze-prompt-success", {
          body: {
            job_id: jobId,
            provider,
            enriched_prompt: enrichedPrompt,
            original_prompt: originalPrompt,
            style_hints: styleHints,
            match_rating: matchRating,
            preference_rating: preferenceRating,
            source: "human",
          },
        });
        
        if (analyzeError) {
          console.error("Learning analysis failed:", analyzeError);
          // Don't throw - rating was still saved
        } else {
          console.log("Learning result:", data);
        }
      }

      return { success: true, isSerendipity };
    },
    onSuccess: (data) => {
      const matchHigh = matchRating >= 4;
      const prefHigh = preferenceRating >= 4;
      const matchLow = matchRating <= 2;
      const prefLow = preferenceRating <= 2;

      let message = "Feedback recorded";
      if (matchHigh && prefHigh) {
        message = "Learning positive patterns from this!";
      } else if (matchLow && prefLow) {
        message = "Learning to avoid these patterns";
      } else if (data.isSerendipity) {
        message = "Happy accident saved! (no prompt learning)";
      } else if (matchHigh && prefLow) {
        message = "Noted: accurate but not your vibe";
      }

      toast({
        title: "Rating saved",
        description: message,
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
        // Show specific error with suggestion
        toast({
          title: "Auto-rating unavailable",
          description: data.suggestion || data.error || "Unknown error",
          variant: data.suggestion ? "default" : "destructive",
        });
      }
    },
  });

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
            <div className="space-y-1">
              <div className="flex justify-between text-muted-foreground">
                <span>Motion</span>
                <span className={getScoreColor(autoMotionScore || 0)}>{autoMotionScore || 0}</span>
              </div>
              <Progress value={autoMotionScore || 0} className="h-1" />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-muted-foreground">
                <span>Cinematic</span>
                <span className={getScoreColor(autoCinematicScore || 0)}>{autoCinematicScore || 0}</span>
              </div>
              <Progress value={autoCinematicScore || 0} className="h-1" />
            </div>
          </div>

          {autoArtifactFlags && autoArtifactFlags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {autoArtifactFlags.map((flag) => (
                <Badge key={flag} variant="destructive" className="text-[9px] h-4">
                  {flag.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
          )}

          {autoReasons && autoReasons.length > 0 && (
            <div className="text-[10px] text-muted-foreground space-y-0.5">
              <span className="font-medium">Analysis: </span>
              {autoReasons.slice(0, 3).map((reason, i) => (
                <div key={i} className="pl-2 text-muted-foreground/80">• {reason}</div>
              ))}
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

      {/* Dual-Axis Human Rating */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-primary" />
          <Label className="text-xs font-medium">Your Rating</Label>
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-3 w-3 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              <p className="text-xs">
                Rate both axes: <strong>Match</strong> = did it follow your prompt? 
                <strong> Preference</strong> = do you like the result?
                Happy accidents (low match, high preference) won't affect prompt learning.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>

        <DualAxisRating
          matchRating={matchRating}
          preferenceRating={preferenceRating}
          onMatchChange={setMatchRating}
          onPreferenceChange={setPreferenceRating}
          onSave={hasRatings ? () => ratingMutation.mutate() : undefined}
          autoMatchScore={autoMatchScore}
          autoQualityScore={autoQualityScore}
          compact
          enableKeyboard
        />
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
      {hasRatings && (
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
      {hasRatings && (
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
