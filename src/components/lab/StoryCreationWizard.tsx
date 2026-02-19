/**
 * StoryCreationWizard v2.0
 * 
 * Integrated with Story Type Router architecture.
 * Replaces old style presets with proper vertical/goal/story-type selection.
 * 
 * Flow:
 * 1. Enter concept
 * 2. Select vertical (guardrails)
 * 3. Select goal (determines story type)
 * 4. Optionally override story type or intensity
 * 5. Build Story → navigates to /stories/:id
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  Wand2,
  Loader2,
  Sparkles,
  ArrowRight,
  Zap,
  Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  type StoryType,
  type ContentVertical,
  type ContentGoal,
  type EmotionalIntensity,
  STORY_TYPE_META,
  VERTICAL_META,
  GOAL_META,
} from "@/types/story-engine";

// Runtime type guards to prevent invalid casts from Select values
function isContentVertical(v: string): v is ContentVertical {
  return v in VERTICAL_META;
}
function isContentGoal(v: string): v is ContentGoal {
  return v in GOAL_META;
}
function isStoryType(v: string): v is StoryType {
  return v in STORY_TYPE_META;
}

const DEFAULT_ACCOUNT_ID = "lab_sandbox";

interface StoryCreationWizardProps {
  onStoryCreated?: (storyId: string) => void;
  className?: string;
}

export function StoryCreationWizard({
  onStoryCreated,
  className,
}: StoryCreationWizardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Core inputs
  const [concept, setConcept] = useState("");
  
  // New: Story Engine inputs
  const [vertical, setVertical] = useState<ContentVertical>("entertainment");
  const [goal, setGoal] = useState<ContentGoal>("reach");
  const [storyTypeOverride, setStoryTypeOverride] = useState<StoryType | "auto">("auto");
  const [intensity, setIntensity] = useState<EmotionalIntensity | "unset">("unset");
  
  // Legacy settings (still needed for some modes)
  const [tier, setTier] = useState<"volume" | "hero">("volume");
  const [lockedProvider, setLockedProvider] = useState<"sora" | "runway" | "luma">("sora");
  const [characterContinuityMode, setCharacterContinuityMode] = useState(false);
  const [brutalityMode, setBrutalityMode] = useState(false);
  
  const [isGenerating, setIsGenerating] = useState(false);

  // Generate story mutation — always calls ONE edge function, backend decides compiler
  const generateStory = useMutation({
    mutationFn: async () => {
      if (!concept.trim()) throw new Error("Enter a concept first");
      
      setIsGenerating(true);
      
      // Build the story engine payload (single source of truth)
      const enginePayload = {
        vertical,
        goal,
        emotional_intensity: intensity === "unset" ? undefined : intensity,
        requested_story_type: storyTypeOverride === "auto" ? undefined : storyTypeOverride,
      };
      
      // Single edge function call — backend runs routeStory() and decides compiler
      const { data, error } = await supabase.functions.invoke("generate-storyboard", {
        body: {
          concept: concept.trim(),
          tier,
          // Story Engine config (single source of truth — no top-level story_type)
          story_engine: enginePayload,
          // Legacy settings
          character_continuity_mode: characterContinuityMode,
          locked_provider: characterContinuityMode ? lockedProvider : undefined,
          brutality_mode: brutalityMode,
          sanitization_level: brutalityMode ? "off" : "soft",
        },
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      // If the backend returned a story ID directly, use it
      if (data?.story_job_id) {
        return { story_job_id: data.story_job_id };
      }
      
      // Resolve story type: prefer backend's resolved value, then explicit override, then fallback
      const resolvedStoryType =
        data?.resolved_story_type ??
        (storyTypeOverride !== "auto" ? storyTypeOverride : undefined) ??
        "viral_hook";
      
      // Build the storyboard with engine config persisted
      const fullStoryboard = {
        scenes: data.scenes || [],
        tier,
        story_spine: data.story_spine || "",
        motif_anchors: data.motif_anchors || [],
        palette_keywords: data.palette_keywords || [],
        character_continuity_mode: characterContinuityMode,
        locked_provider: characterContinuityMode ? lockedProvider : undefined,
        soft_continuity: true,
        brutality_mode: brutalityMode,
        sanitization_level: brutalityMode ? "off" : "soft",
        story_engine: {
          ...enginePayload,
          resolved_story_type: resolvedStoryType,
          compiler: data?.compiler,
        },
      };
      
      const { data: newStory, error: insertError } = await supabase
        .from("story_jobs")
        .insert([{
          account_id: DEFAULT_ACCOUNT_ID,
          title: data.title || `Story ${new Date().toLocaleDateString()}`,
          story_type: resolvedStoryType,
          storyboard_json: JSON.parse(JSON.stringify(fullStoryboard)),
          continuity_anchors: JSON.parse(JSON.stringify(data.anchors || {})),
          total_clips: (data.scenes || []).length,
          status: "draft",
        }])
        .select()
        .single();
      
      if (insertError) throw insertError;
      
      return { story_job_id: newStory.id };
    },
    onSuccess: (data) => {
      setIsGenerating(false);
      queryClient.invalidateQueries({ queryKey: ["story-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["recent-story"] });
      queryClient.invalidateQueries({ queryKey: ["stories-list"] });
      
      toast({
        title: "Story ready!",
        description: "Opening Story Studio for editing and generation...",
      });
      
      if (data.story_job_id) {
        onStoryCreated?.(data.story_job_id);
      }
    },
    onError: (error) => {
      setIsGenerating(false);
      toast({
        title: "Failed to create story",
        description: String(error),
        variant: "destructive",
      });
    },
  });

  return (
    <div className={`flex flex-col h-full p-4 ${className}`}>
      <Card className="border-primary/30 bg-primary/5 max-w-xl mx-auto w-full">
        <CardContent className="p-4 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Create a New Story</h2>
          </div>
          
          {/* Concept Input */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">What's your story about?</Label>
            <Textarea
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="E.g., 3 supplement mistakes that are wasting your money..."
              className="h-24 text-sm resize-none"
            />
          </div>
          
          {/* Vertical + Goal Row */}
          <div className="grid grid-cols-2 gap-3">
            {/* Vertical */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Vertical</Label>
              <Select value={vertical} onValueChange={(v) => { if (isContentVertical(v)) setVertical(v); }}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(VERTICAL_META).map(([key, meta]) => (
                    <SelectItem key={key} value={key} className="text-xs">
                      {meta.icon} {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Goal */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Goal</Label>
              <Select value={goal} onValueChange={(v) => { if (isContentGoal(v)) setGoal(v); }}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(GOAL_META).map(([key, meta]) => (
                    <SelectItem key={key} value={key} className="text-xs">
                      {meta.icon} {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Story Type + Tier Row */}
          <div className="grid grid-cols-2 gap-3">
            {/* Story Type */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Story Type</Label>
              <Select value={storyTypeOverride} onValueChange={(v) => { if (v === "auto" || isStoryType(v)) setStoryTypeOverride(v); }}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto" className="text-xs">
                    ⚡ Auto (recommended)
                  </SelectItem>
                  {Object.entries(STORY_TYPE_META).map(([key, meta]) => (
                    <SelectItem key={key} value={key} className="text-xs">
                      {meta.icon} {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Tier */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tier</Label>
              <Select value={tier} onValueChange={(v) => setTier(v as "volume" | "hero")}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="volume" className="text-xs">📦 Volume</SelectItem>
                  <SelectItem value="hero" className="text-xs">⭐ Hero</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Story type description */}
          {storyTypeOverride !== "auto" && STORY_TYPE_META[storyTypeOverride] && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-muted/50 text-xs text-muted-foreground">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{STORY_TYPE_META[storyTypeOverride].description}</span>
            </div>
          )}
          
          {storyTypeOverride === "auto" && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-muted/50 text-xs text-muted-foreground">
              <Zap className="h-3 w-3 mt-0.5 shrink-0" />
              <span>Story type will be selected automatically based on your vertical + goal. Override only if you have a specific format in mind.</span>
            </div>
          )}
          
          {/* Advanced Settings */}
          <Collapsible>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 w-full pt-2 border-t border-border/50 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <ChevronDown className="h-3 w-3" />
                <span>Advanced Settings</span>
                {(intensity !== "unset" || characterContinuityMode || brutalityMode) && (
                  <Badge variant="outline" className="text-[9px] h-4 ml-1">
                    Modified
                  </Badge>
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-3">
              {/* Emotional Intensity */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Emotional Intensity</Label>
                <Select value={intensity} onValueChange={(v) => { const valid: string[] = ["unset","low","medium","high","extreme"]; if (valid.includes(v)) setIntensity(v as EmotionalIntensity | "unset"); }}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset" className="text-xs">Unset (auto)</SelectItem>
                    <SelectItem value="low" className="text-xs">🌊 Low</SelectItem>
                    <SelectItem value="medium" className="text-xs">⚡ Medium</SelectItem>
                    <SelectItem value="high" className="text-xs">🔥 High</SelectItem>
                    <SelectItem value="extreme" className="text-xs">💥 Extreme</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  Clamped by vertical safety rules. Health/Finance cap at medium.
                </p>
              </div>
              
              {/* Character Continuity */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs">Character Continuity</Label>
                  <p className="text-[10px] text-muted-foreground">Lock all scenes to one provider</p>
                </div>
                <button
                  onClick={() => setCharacterContinuityMode(!characterContinuityMode)}
                  className={`w-10 h-5 rounded-full transition-colors ${
                    characterContinuityMode ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    characterContinuityMode ? "translate-x-5" : "translate-x-0.5"
                  }`} />
                </button>
              </div>
              
              {characterContinuityMode && (
                <div className="flex items-center justify-between pl-4">
                  <Label className="text-xs">Provider:</Label>
                  <Select value={lockedProvider} onValueChange={(v) => setLockedProvider(v as "sora" | "runway" | "luma")}>
                    <SelectTrigger className="h-8 text-xs w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sora" className="text-xs">🎬 Sora</SelectItem>
                      <SelectItem value="runway" className="text-xs">🚀 Runway</SelectItem>
                      <SelectItem value="luma" className="text-xs">🌙 Luma</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {/* Brutality Mode */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs">Brutality Mode</Label>
                  <p className="text-[10px] text-muted-foreground">Reduce sanitization for intense content</p>
                </div>
                <button
                  onClick={() => setBrutalityMode(!brutalityMode)}
                  className={`w-10 h-5 rounded-full transition-colors ${
                    brutalityMode ? "bg-destructive" : "bg-muted"
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    brutalityMode ? "translate-x-5" : "translate-x-0.5"
                  }`} />
                </button>
              </div>
            </CollapsibleContent>
          </Collapsible>
          
          {/* Build Button */}
          <Button
            onClick={() => generateStory.mutate()}
            disabled={!concept.trim() || isGenerating}
            className="w-full h-11"
            size="lg"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Wand2 className="h-4 w-4 mr-2" />
            )}
            {isGenerating ? "Creating Story..." : "Build Story"}
          </Button>
          
          {/* Next Step Hint */}
          <p className="text-[11px] text-muted-foreground text-center flex items-center gap-1.5 justify-center">
            <ArrowRight className="h-3 w-3" />
            Opens Story Studio for editing and generation
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
