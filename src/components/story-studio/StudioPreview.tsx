/**
 * StudioPreview - Center panel with unified audio-master preview
 */

import { useState } from "react";
import { Film, Download, Volume2, VolumeX, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useReelAssembly } from "@/hooks/use-reel-assembly";
import { cn } from "@/lib/utils";
import { StorySyncPreview } from "@/components/lab/StorySyncPreview";
import { StoryVideoPlayer } from "@/components/lab/StoryVideoPlayer";
import type { Tables } from "@/integrations/supabase/types";
import type { StoryScene } from "@/lib/continuity-scoring";
import type { StoryVoiceover } from "@/hooks/use-story-voiceover";

type VideoJob = Tables<"video_jobs">;

interface StudioPreviewProps {
  clips: VideoJob[];
  scenes: StoryScene[];
  voiceover: StoryVoiceover | null | undefined;
  storyId: string;
  clipsBySceneId: Map<string, VideoJob>;
}

export function StudioPreview({
  clips,
  scenes,
  voiceover,
  storyId,
  clipsBySceneId,
}: StudioPreviewProps) {
  const {
    assemble,
    isAssembling,
    hasAssembledVideo,
    videoUrl: assembledUrl,
    status: assemblyStatus,
    meta: assemblyMeta,
  } = useReelAssembly(storyId, "story");

  // Completed clips count
  const completedClips = clips.filter(c => c.status === "done" && c.output_url);
  const hasCompletedClips = completedClips.length > 0;
  const hasVoiceover = voiceover?.audio_url && voiceover?.status === "done";

  // Progress
  const progressPct = scenes.length > 0 
    ? Math.round((completedClips.length / scenes.length) * 100) 
    : 0;

  const handleAssemble = () => assemble();

  // Empty state
  if (!hasCompletedClips && !hasVoiceover) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-muted/20 p-6">
        <Film className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="font-medium text-sm mb-1">No clips yet</h3>
        <p className="text-xs text-muted-foreground text-center max-w-[200px]">
          Generate clips from your scenes to preview the story
        </p>
        {scenes.length > 0 && (
          <Badge variant="outline" className="mt-4 text-xs">
            {scenes.length} scenes ready
          </Badge>
        )}
      </div>
    );
  }

  // Unified sync preview (audio + video)
  if (hasCompletedClips && hasVoiceover) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              <Volume2 className="h-3 w-3 mr-1" />
              Audio + Video
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {completedClips.length}/{scenes.length} clips
            </span>
            {assemblyStatus === "rendering" && (
              <Badge variant="outline" className="text-[10px] animate-pulse">
                Rendering...
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={handleAssemble}
            disabled={isAssembling}
          >
            {isAssembling ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Download className="h-3 w-3" />
            )}
            Export
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-black/90">
          <div className="max-w-lg mx-auto">
            <StorySyncPreview
              clips={clips}
              voiceover={voiceover}
              onAssemble={handleAssemble}
              isAssembling={isAssembling}
              assembledUrl={assembledUrl || null}
              className="w-full aspect-[9/16]"
            />
          </div>
        </div>
      </div>
    );
  }

  // Video-only preview
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            <VolumeX className="h-3 w-3 mr-1" />
            Video Only
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            {completedClips.length}/{scenes.length} clips
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          onClick={handleAssemble}
          disabled={isAssembling || completedClips.length === 0}
        >
          {isAssembling ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Download className="h-3 w-3" />
          )}
          Export
        </Button>
      </div>

      {progressPct < 100 && progressPct > 0 && (
        <div className="px-4 py-1 border-b">
          <Progress value={progressPct} className="h-1" />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-black/90">
        <div className="max-w-lg mx-auto">
          <StoryVideoPlayer
            clips={clips}
            onAssemble={handleAssemble}
            isAssembling={isAssembling}
            assembledUrl={assembledUrl || null}
            className="w-full aspect-[9/16]"
          />
        </div>
      </div>
    </div>
  );
}
