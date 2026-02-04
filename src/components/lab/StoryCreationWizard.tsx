/**
 * StoryCreationWizard
 * 
 * A simplified story creation flow that funnels directly to Story Studio.
 * This replaces the monolithic StoryBuilderPanel for the creation step only.
 * 
 * Features:
 * - Concept input
 * - Story type selector
 * - Scene count selector
 * - Style presets (replacing 5+ confusing toggles)
 * - Single "Build Story" action that navigates to /story/:id
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { STORY_TYPE_CONFIGS, type StoryType } from "@/lib/continuity-scoring";

// Style presets that replace multiple confusing toggles
const STYLE_PRESETS = {
  standard: {
    label: "Standard",
    description: "Default multi-provider routing for best quality per scene",
    emoji: "🎥",
    filmMode: false,
    mythMode: false,
    characterContinuityMode: false,
  },
  cinematic: {
    label: "Cinematic",
    description: "Film-first I2V chaining for professional visual continuity",
    emoji: "🎬",
    filmMode: true,
    mythMode: false,
    characterContinuityMode: false,
  },
  storybook: {
    label: "Storybook",
    description: "Symbolic silhouettes, no faces, fable-like aesthetic",
    emoji: "📜",
    filmMode: false,
    mythMode: true,
    characterContinuityMode: false,
  },
  character: {
    label: "Character Focus",
    description: "Single provider for consistent character appearance",
    emoji: "🔗",
    filmMode: false,
    mythMode: false,
    characterContinuityMode: true,
  },
} as const;

type StylePreset = keyof typeof STYLE_PRESETS;

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
  const [storyType, setStoryType] = useState<StoryType>("short_story");
  const [sceneCount, setSceneCount] = useState<number>(5);
  const [tier, setTier] = useState<"volume" | "hero">("volume");
  
  // Style preset (replaces multiple toggles)
  const [stylePreset, setStylePreset] = useState<StylePreset>("standard");
  
  // Advanced settings (collapsed)
  const [lockedProvider, setLockedProvider] = useState<"sora" | "runway" | "luma">("sora");
  const [brutalityMode, setBrutalityMode] = useState(false);
  
  const [isGenerating, setIsGenerating] = useState(false);

  // Derive mode flags from preset
  const presetConfig = STYLE_PRESETS[stylePreset];
  const filmMode = presetConfig.filmMode;
  const mythMode = presetConfig.mythMode;
  const characterContinuityMode = presetConfig.characterContinuityMode;

  // Generate story mutation
  const generateStory = useMutation({
    mutationFn: async () => {
      if (!concept.trim()) throw new Error("Enter a concept first");
      
      setIsGenerating(true);
      
      // Myth Mode uses the storybook-style generator
      if (mythMode) {
        const { data, error } = await supabase.functions.invoke("create-story-myth-mode", {
          body: {
            account_id: DEFAULT_ACCOUNT_ID,
            premise: concept.trim(),
            scene_count: sceneCount,
          },
        });
        
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        
        return {
          story_job_id: data.story?.id,
          myth_mode: true,
        };
      }
      
      // Film Mode uses the film-first generator
      if (filmMode) {
        const { data, error } = await supabase.functions.invoke("create-story-film-mode", {
          body: {
            account_id: DEFAULT_ACCOUNT_ID,
            premise: concept.trim(),
            scene_count: sceneCount,
            tier,
          },
        });
        
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        
        return {
          story_job_id: data.story?.id,
          film_mode: true,
        };
      }
      
      // Standard/Character Focus: use generate-storyboard
      const { data, error } = await supabase.functions.invoke("generate-storyboard", {
        body: {
          concept: concept.trim(),
          story_type: storyType,
          tier,
          scene_count: sceneCount,
          // Character continuity settings
          character_continuity_mode: characterContinuityMode,
          locked_provider: characterContinuityMode ? lockedProvider : undefined,
          // Brutality mode for intense content
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
      
      // Otherwise, create the story from the generated storyboard
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
      };
      
      const { data: newStory, error: insertError } = await supabase
        .from("story_jobs")
        .insert([{
          account_id: DEFAULT_ACCOUNT_ID,
          title: data.title || `Story ${new Date().toLocaleDateString()}`,
          story_type: storyType,
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
      {/* Main Creation Card */}
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
              placeholder="E.g., A lonely astronaut discovers a garden growing on Mars..."
              className="h-24 text-sm resize-none"
            />
          </div>
          
          {/* Quick Settings Row */}
          <div className="grid grid-cols-3 gap-3">
            {/* Story Type */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={storyType} onValueChange={(v) => setStoryType(v as StoryType)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STORY_TYPE_CONFIGS).map(([key, cfg]) => (
                    <SelectItem key={key} value={key} className="text-xs">
                      {cfg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Scene Count */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Scenes</Label>
              <Select value={String(sceneCount)} onValueChange={(v) => setSceneCount(Number(v))}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 5, 7, 10].map(n => (
                    <SelectItem key={n} value={String(n)} className="text-xs">
                      {n} scenes
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
                  <SelectItem value="volume" className="text-xs">
                    📦 Volume
                  </SelectItem>
                  <SelectItem value="hero" className="text-xs">
                    ⭐ Hero
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Style Preset */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Style</Label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(STYLE_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => setStylePreset(key as StylePreset)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    stylePreset === key
                      ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                      : "border-border hover:border-primary/50 hover:bg-accent/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{preset.emoji}</span>
                    <span className="text-sm font-medium">{preset.label}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                    {preset.description}
                  </p>
                </button>
              ))}
            </div>
          </div>
          
          {/* Advanced Settings (collapsed) */}
          <Collapsible>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 w-full pt-2 border-t border-border/50 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <ChevronDown className="h-3 w-3" />
                <span>Advanced Settings</span>
                {brutalityMode && (
                  <Badge variant="outline" className="text-[9px] h-4 ml-1 bg-destructive/10 text-destructive border-destructive/30">
                    Brutality
                  </Badge>
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-3">
              {/* Provider Lock (only for Character Focus) */}
              {characterContinuityMode && (
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Lock ALL scenes to:</Label>
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
              
              {/* Brutality Mode (only for Cinematic/Standard) */}
              {(filmMode || stylePreset === "standard") && (
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs">Brutality Mode</Label>
                    <p className="text-[10px] text-muted-foreground">
                      Reduces sanitization for intense content (higher failure risk)
                    </p>
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
              )}
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

