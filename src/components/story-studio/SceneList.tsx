/**
 * SceneList - Compact scene list with status chips and drag-drop
 */

import { useMemo } from "react";
import {
  CheckCircle2,
  Loader2,
  XCircle,
  AlertTriangle,
  GripVertical,
  Film,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";
import type { StoryScene, SceneRole } from "@/lib/continuity-scoring";
import { PROVIDER_DISPLAY } from "@/types/scene-roles";

type VideoJob = Tables<"video_jobs">;

interface SceneListProps {
  scenes: StoryScene[];
  clipsBySceneId: Map<string, VideoJob>;
  selectedSceneId: string | null;
  onSelectScene: (sceneId: string) => void;
  storyType: string;
}

// Role colors using semantic tokens
const ROLE_COLORS: Record<SceneRole | string, string> = {
  hook: "bg-primary",
  problem: "bg-secondary",
  story_a: "bg-accent",
  reset: "bg-primary",
  story_b: "bg-accent",
  cta: "bg-secondary",
  atmosphere: "bg-muted",
  establish: "bg-accent",
};

export function SceneList({
  scenes,
  clipsBySceneId,
  selectedSceneId,
  onSelectScene,
  storyType,
}: SceneListProps) {
  return (
    <div className="p-2 space-y-1">
      {scenes.map((scene, index) => {
        const clip = clipsBySceneId.get(scene.id);
        const isSelected = selectedSceneId === scene.id;
        
        return (
          <SceneCard
            key={scene.id}
            scene={scene}
            index={index}
            clip={clip}
            isSelected={isSelected}
            onSelect={() => onSelectScene(scene.id)}
          />
        );
      })}
      
      {scenes.length === 0 && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          <Film className="h-8 w-8 mx-auto mb-2 opacity-50" />
          No scenes yet
        </div>
      )}
    </div>
  );
}

interface SceneCardProps {
  scene: StoryScene;
  index: number;
  clip?: VideoJob;
  isSelected: boolean;
  onSelect: () => void;
}

function SceneCard({ scene, index, clip, isSelected, onSelect }: SceneCardProps) {
  // Status indicator
  const statusIndicator = useMemo(() => {
    if (!clip) {
      return (
        <Badge variant="outline" className="text-[9px] h-5 px-1.5 bg-muted/50">
          Pending
        </Badge>
      );
    }
    
    const { status, progress, provider } = clip;
    const providerEmoji = PROVIDER_DISPLAY[provider as keyof typeof PROVIDER_DISPLAY]?.emoji || "🎬";
    
    if (status === "done") {
      return (
        <Badge variant="outline" className="text-[9px] h-5 px-1.5 gap-1 bg-primary/10 text-primary border-primary/30">
          <CheckCircle2 className="h-3 w-3" />
          {providerEmoji}
        </Badge>
      );
    }
    
    if (status === "running" || status === "queued") {
      return (
        <Badge variant="outline" className="text-[9px] h-5 px-1.5 gap-1 bg-primary/10 text-primary border-primary/30">
          <Loader2 className="h-3 w-3 animate-spin" />
          {progress ?? 0}%
        </Badge>
      );
    }
    
    if (status === "failed") {
      return (
        <Badge variant="outline" className="text-[9px] h-5 px-1.5 gap-1 bg-destructive/10 text-destructive border-destructive/30">
          <XCircle className="h-3 w-3" />
          Failed
        </Badge>
      );
    }
    
    return null;
  }, [clip]);

  // Prompt preview (first 50 chars)
  const promptPreview = (scene.prompt || scene.subject_action || "").slice(0, 50);
  const role = scene.role || "story_a";
  const roleColor = ROLE_COLORS[role] || "bg-muted";

  return (
    <div
      onClick={onSelect}
      className={cn(
        "group flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-all",
        isSelected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border/50 hover:border-border hover:bg-muted/30"
      )}
    >
      {/* Drag handle + index */}
      <div className="flex flex-col items-center gap-1 pt-0.5">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 opacity-0 group-hover:opacity-100 cursor-grab" />
        <span className="text-[10px] text-muted-foreground font-mono">
          {index + 1}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Role + Status row */}
        <div className="flex items-center gap-1.5">
          <Badge 
            variant="outline" 
            className={cn("text-[9px] h-4 px-1.5 text-white border-0", roleColor)}
          >
            {role.replace("_", " ").toUpperCase().slice(0, 6)}
          </Badge>
          {statusIndicator}
          {clip?.is_primary && (
            <Badge variant="outline" className="text-[9px] h-4 px-1 bg-accent/20 text-accent-foreground border-accent/30">
              ★
            </Badge>
          )}
        </div>

        {/* Prompt preview */}
        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-tight">
          {promptPreview || <span className="italic">No prompt</span>}
          {promptPreview.length >= 50 && "..."}
        </p>

        {/* Duration */}
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70">
          <span>{scene.duration_target || 5}s</span>
          {scene.camera_direction && (
            <>
              <span>•</span>
              <span className="truncate">{scene.camera_direction}</span>
            </>
          )}
        </div>
      </div>

      {/* Thumbnail (if clip done) */}
      {clip?.status === "done" && clip.thumbnail_url && (
        <div className="flex-shrink-0 w-12 h-12 rounded overflow-hidden bg-muted">
          <img
            src={clip.thumbnail_url}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}
    </div>
  );
}
