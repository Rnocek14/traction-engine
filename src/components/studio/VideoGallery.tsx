import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Pin,
  Play,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SpritesheetScrubber } from "./SpritesheetScrubber";
import type { Tables } from "@/integrations/supabase/types";

type VideoJob = Tables<"video_jobs">;

interface VideoGalleryProps {
  scriptId: string;
  versionChainIds?: string[];
  selectedJobId: string | null;
  onSelectJob: (jobId: string | null) => void;
  onPreviewVideo: (url: string) => void;
  className?: string;
}

/**
 * Horizontal gallery of rendered videos for quick comparison.
 * Shows all renders for current script (and optionally version chain).
 */
export function VideoGallery({
  scriptId,
  versionChainIds = [],
  selectedJobId,
  onSelectJob,
  onPreviewVideo,
  className,
}: VideoGalleryProps) {
  // Fetch all video jobs for this script and optionally version chain
  const allScriptIds = [scriptId, ...versionChainIds];

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["video-gallery", scriptId, versionChainIds],
    queryFn: async (): Promise<VideoJob[]> => {
      const { data, error } = await supabase
        .from("video_jobs")
        .select("*")
        .in("script_run_id", allScriptIds)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });

  const completedJobs = jobs.filter(
    (j) => j.status === "succeeded" || j.status === "done"
  );
  const activeJobs = jobs.filter((j) =>
    ["queued", "running", "rendering"].includes(j.status)
  );

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-4", className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className={cn("text-center py-4", className)}>
        <p className="text-xs text-muted-foreground">No renders yet</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Active renders */}
      {activeJobs.length > 0 && (
        <div className="flex items-center gap-2 px-2">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          <span className="text-[10px] text-muted-foreground">
            {activeJobs.length} rendering...
          </span>
        </div>
      )}

      {/* Gallery strip */}
      <ScrollArea className="w-full">
        <div className="flex gap-2 p-2">
          {jobs.map((job) => (
            <VideoTile
              key={job.id}
              job={job}
              isSelected={job.id === selectedJobId}
              isFromDifferentVersion={job.script_run_id !== scriptId}
              onSelect={() => onSelectJob(job.id === selectedJobId ? null : job.id)}
              onPreview={() => job.output_url && onPreviewVideo(job.output_url)}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* Stats */}
      <div className="flex items-center justify-between px-2 text-[10px] text-muted-foreground">
        <span>{completedJobs.length} completed</span>
        <span>{jobs.length} total</span>
      </div>
    </div>
  );
}

interface VideoTileProps {
  job: VideoJob;
  isSelected: boolean;
  isFromDifferentVersion: boolean;
  onSelect: () => void;
  onPreview: () => void;
}

function VideoTile({
  job,
  isSelected,
  isFromDifferentVersion,
  onSelect,
  onPreview,
}: VideoTileProps) {
  const settings = (job.settings ?? {}) as Record<string, unknown>;
  const size = typeof settings.size === "string" ? settings.size : "";
  const seconds = typeof settings.seconds === "number" ? settings.seconds : 0;

  const thumbnailUrl = (job as unknown as { thumbnail_url?: string }).thumbnail_url;
  const spritesheetUrl = (job as unknown as { spritesheet_url?: string }).spritesheet_url;

  const isCompleted = job.status === "succeeded" || job.status === "done";
  const isActive = ["queued", "running", "rendering"].includes(job.status);
  const isFailed = job.status === "failed";

  // Parse aspect from size
  const [w, h] = size.split("x").map(Number);
  const isVertical = h > w;
  const aspectLabel = isVertical ? "9:16" : "16:9";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onSelect}
            className={cn(
              "relative flex-shrink-0 rounded-lg overflow-hidden",
              "border-2 transition-all duration-150",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              isSelected
                ? "border-primary shadow-[0_0_15px_hsl(var(--primary)/0.4)]"
                : "border-border/30 hover:border-border/50",
              isFromDifferentVersion && "opacity-60"
            )}
            style={{
              width: isVertical ? 48 : 80,
              height: isVertical ? 80 : 48,
            }}
          >
            {/* Thumbnail/Spritesheet */}
            {thumbnailUrl && spritesheetUrl ? (
              <SpritesheetScrubber
                thumbnailUrl={thumbnailUrl}
                spritesheetUrl={spritesheetUrl}
                className="w-full h-full"
                cols={10}
                rows={10}
              />
            ) : thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt="Render"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-secondary/50 flex items-center justify-center">
                {isActive ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : isFailed ? (
                  <XCircle className="h-4 w-4 text-destructive" />
                ) : (
                  <Clock className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            )}

            {/* Status overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent pointer-events-none" />

            {/* Pin indicator */}
            {isSelected && (
              <div className="absolute top-1 right-1">
                <Pin className="h-3 w-3 text-primary fill-primary" />
              </div>
            )}

            {/* Duration badge */}
            {seconds > 0 && (
              <div className="absolute bottom-1 left-1">
                <span className="text-[9px] font-mono bg-background/80 px-1 rounded">
                  {seconds}s
                </span>
              </div>
            )}

            {/* Play button on hover for completed */}
            {isCompleted && job.output_url && (
              <div
                className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-background/50"
                onClick={(e) => {
                  e.stopPropagation();
                  onPreview();
                }}
              >
                <Play className="h-5 w-5 text-primary" />
              </div>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <StatusBadge status={job.status} />
              <span className="text-[10px] text-muted-foreground">
                {aspectLabel} • {seconds}s
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
            </p>
            {isFromDifferentVersion && (
              <p className="text-[10px] text-warning">From different version</p>
            )}
            {job.error && (
              <p className="text-[10px] text-destructive truncate max-w-[200px]">
                {job.error}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "succeeded":
    case "done":
      return (
        <Badge variant="outline" className="h-5 text-[10px] bg-success/20 text-success border-success/30">
          Done
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive" className="h-5 text-[10px]">
          Failed
        </Badge>
      );
    case "running":
    case "rendering":
      return (
        <Badge variant="outline" className="h-5 text-[10px] bg-primary/20 text-primary border-primary/30">
          Rendering
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="h-5 text-[10px]">
          Queued
        </Badge>
      );
  }
}
