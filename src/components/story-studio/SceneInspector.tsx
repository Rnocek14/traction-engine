/**
 * SceneInspector - Right panel for scene details, provider selection, alternates
 */

import { useState } from "react";
import {
  Play,
  RotateCcw,
  CheckCircle2,
  Loader2,
  XCircle,
  Wand2,
  Star,
  Clock,
  Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";
import type { StoryScene, ContinuityAnchors, SceneRole } from "@/lib/continuity-scoring";
import { PROVIDER_DISPLAY, ROLE_DISPLAY } from "@/types/scene-roles";

type VideoJob = Tables<"video_jobs">;

interface SceneInspectorProps {
  scene: StoryScene;
  sceneIndex: number;
  clip?: VideoJob;
  allClips: VideoJob[];
  onUpdateScene: (updates: Partial<StoryScene>) => void;
  onSetPrimary: (clipId: string) => void;
  onRegenerate: () => void;
  storyType: string;
  anchors: ContinuityAnchors;
}

const AVAILABLE_ROLES: Array<{ value: SceneRole; label: string }> = [
  { value: "hook", label: "Hook" },
  { value: "problem", label: "Problem" },
  { value: "story_a", label: "Story A" },
  { value: "reset", label: "Reset" },
  { value: "story_b", label: "Story B" },
  { value: "cta", label: "CTA" },
  { value: "atmosphere", label: "Atmosphere" },
  { value: "establish", label: "Establish" },
];

const PROVIDERS = ["sora", "runway", "luma"] as const;

export function SceneInspector({
  scene,
  sceneIndex,
  clip,
  allClips,
  onUpdateScene,
  onSetPrimary,
  onRegenerate,
  storyType,
  anchors,
}: SceneInspectorProps) {
  const [localPrompt, setLocalPrompt] = useState(scene.prompt || scene.subject_action || "");

  // Completed alternates
  const alternates = allClips.filter(c => c.status === "done" && c.output_url);
  const hasAlternates = alternates.length > 1;

  // Provider override (stored in scene settings or inferred)
  const providerOverride = (scene as StoryScene & { provider_override?: string }).provider_override;

  // Sync quality calculation
  const clipDurationS = clip?.settings 
    ? ((clip.settings as { seconds?: number }).seconds || 5) 
    : 5;
  const narrationDurationS = scene.duration_target || 5;
  const driftS = Math.abs(clipDurationS - narrationDurationS);
  const syncStatus: "good" | "fair" | "poor" = driftS < 1 ? "good" : driftS < 3 ? "fair" : "poor";

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              Scene {sceneIndex + 1}
            </Badge>
            {clip?.is_primary && (
              <Badge variant="outline" className="text-[10px] bg-accent/20 text-accent-foreground">
                ★ Primary
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={onRegenerate}
          >
            <RotateCcw className="h-3 w-3" />
            Regenerate
          </Button>
        </div>

        <Separator />

        {/* Prompt Editor */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Visual Prompt</Label>
          <Textarea
            value={localPrompt}
            onChange={(e) => setLocalPrompt(e.target.value)}
            onBlur={() => onUpdateScene({ prompt: localPrompt, subject_action: localPrompt })}
            placeholder="Describe what happens in this scene..."
            className="min-h-[100px] text-sm"
          />
        </div>

        {/* Scene Settings Row */}
        <div className="grid grid-cols-2 gap-3">
          {/* Role */}
          <div className="space-y-1.5">
            <Label className="text-xs">Role</Label>
            <Select
              value={scene.role || "story_a"}
              onValueChange={(v) => onUpdateScene({ role: v as SceneRole })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_ROLES.map(r => (
                  <SelectItem key={r.value} value={r.value} className="text-xs">
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Duration */}
          <div className="space-y-1.5">
            <Label className="text-xs">Duration</Label>
            <Select
              value={String(scene.duration_target || 5)}
              onValueChange={(v) => onUpdateScene({ duration_target: Number(v) })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[3, 4, 5, 6, 8, 10].map(d => (
                  <SelectItem key={d} value={String(d)} className="text-xs">
                    {d}s
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Camera Direction */}
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1">
            <Camera className="h-3 w-3" />
            Camera Direction
          </Label>
          <Input
            value={scene.camera_direction || ""}
            onChange={(e) => onUpdateScene({ camera_direction: e.target.value })}
            placeholder="slow push-in, handheld, etc."
            className="h-8 text-xs"
          />
        </div>

        <Separator />

        {/* Provider Override */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">Generator</Label>
            {clip?.provider && (
              <Badge variant="outline" className="text-[10px]">
                Used: {PROVIDER_DISPLAY[clip.provider as keyof typeof PROVIDER_DISPLAY]?.label || clip.provider}
              </Badge>
            )}
          </div>
          <div className="flex gap-1">
            {["auto", ...PROVIDERS].map(p => {
              const isActive = p === "auto" 
                ? !providerOverride 
                : providerOverride === p;
              const display = p === "auto" 
                ? { emoji: "🤖", label: "Auto" }
                : PROVIDER_DISPLAY[p as keyof typeof PROVIDER_DISPLAY];
              
              return (
                <Button
                  key={p}
                  size="sm"
                  variant={isActive ? "default" : "outline"}
                  className="h-7 text-xs gap-1 flex-1"
                  onClick={() => onUpdateScene({ 
                    provider_override: p === "auto" ? undefined : p 
                  } as Partial<StoryScene>)}
                >
                  {display?.emoji} {display?.label}
                </Button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Auto uses smart routing based on scene content
          </p>
        </div>

        <Separator />

        {/* Sync Quality */}
        <div className="space-y-2">
          <Label className="text-xs font-medium flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Sync Quality
          </Label>
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline" 
              className={cn(
                "text-[10px]",
                syncStatus === "good" && "bg-primary/10 text-primary",
                syncStatus === "fair" && "bg-accent/20 text-accent-foreground",
                syncStatus === "poor" && "bg-destructive/10 text-destructive",
              )}
            >
              {syncStatus === "good" ? "✓ Good" : syncStatus === "fair" ? "⚠ Fair" : "✗ Poor"}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              Clip: {clipDurationS}s vs Narration: {narrationDurationS}s
            </span>
          </div>
          {syncStatus === "poor" && (
            <p className="text-[10px] text-destructive">
              Large mismatch — clip will freeze or be cut early
            </p>
          )}
        </div>

        <Separator />

        {/* Alternates / Primary Selection */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">
            Clips ({alternates.length})
          </Label>
          
          {alternates.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground border rounded-lg">
              No completed clips yet
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {alternates.map(alt => (
                <AlternateClipCard
                  key={alt.id}
                  clip={alt}
                  isPrimary={alt.is_primary}
                  onSetPrimary={() => onSetPrimary(alt.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Current clip status */}
        {clip && clip.status !== "done" && (
          <>
            <Separator />
            <div className="space-y-2">
              <Label className="text-xs font-medium">Generation Status</Label>
              <ClipStatusDisplay clip={clip} />
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  );
}

interface AlternateClipCardProps {
  clip: VideoJob;
  isPrimary: boolean;
  onSetPrimary: () => void;
}

function AlternateClipCard({ clip, isPrimary, onSetPrimary }: AlternateClipCardProps) {
  const provider = PROVIDER_DISPLAY[clip.provider as keyof typeof PROVIDER_DISPLAY];
  
  return (
    <div 
      className={cn(
        "relative rounded-lg overflow-hidden border cursor-pointer group transition-all",
        isPrimary ? "ring-2 ring-primary border-primary" : "hover:border-primary"
      )}
      onClick={onSetPrimary}
    >
      {/* Thumbnail */}
      {clip.thumbnail_url ? (
        <img
          src={clip.thumbnail_url}
          alt=""
          className="w-full aspect-video object-cover"
        />
      ) : (
        <div className="w-full aspect-video bg-muted flex items-center justify-center">
          <Play className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
      
      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      
      {/* Provider badge */}
      <Badge 
        variant="secondary" 
        className="absolute top-1 left-1 text-[9px] h-5 bg-background/80"
      >
        {provider?.emoji} {provider?.label || clip.provider}
      </Badge>
      
      {/* Primary indicator */}
      {isPrimary && (
        <Badge 
          variant="default" 
          className="absolute top-1 right-1 text-[9px] h-5 bg-accent text-accent-foreground"
        >
          <Star className="h-3 w-3 mr-0.5" />
          Primary
        </Badge>
      )}
      
      {/* Select hint on hover */}
      {!isPrimary && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-white text-xs font-medium bg-black/50 px-2 py-1 rounded">
            Set as Primary
          </span>
        </div>
      )}
    </div>
  );
}

function ClipStatusDisplay({ clip }: { clip: VideoJob }) {
  const { status, progress, error, provider } = clip;
  
  if (status === "running" || status === "queued") {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <div className="flex-1">
          <p className="text-xs font-medium">
            {status === "queued" ? "Queued" : "Generating"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {provider} • {progress || 0}%
          </p>
        </div>
      </div>
    );
  }
  
  if (status === "failed") {
    return (
      <div className="p-2 rounded-lg bg-destructive/5 border border-destructive/20">
        <div className="flex items-center gap-2">
          <XCircle className="h-4 w-4 text-destructive" />
          <p className="text-xs font-medium text-destructive">Failed</p>
        </div>
        {error && (
          <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
            {error}
          </p>
        )}
      </div>
    );
  }
  
  return null;
}
