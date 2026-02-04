/**
 * StoryLibrary
 * 
 * Displays all stories with their clips, properly separated.
 * Each story shows its own filmstrip of generated clips.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  Film,
  Clock,
  CheckCircle,
  Loader2,
  Play,
  AlertCircle,
  Plus,
  MoreHorizontal,
  Archive,
  ArchiveRestore,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type StoryJob = Tables<"story_jobs">;
type VideoJob = Tables<"video_jobs">;

interface StoryLibraryProps {
  className?: string;
  onSelectStory?: (storyId: string) => void;
  activeStoryId?: string | null;
}

interface StoryWithClips extends StoryJob {
  clips: VideoJob[];
}

export function StoryLibrary({
  className,
  onSelectStory,
  activeStoryId,
}: StoryLibraryProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch all stories (excluding archived unless showArchived is true)
  const { data: stories, isLoading: storiesLoading } = useQuery({
    queryKey: ["story-library", showArchived],
    queryFn: async () => {
      let query = supabase
        .from("story_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (!showArchived) {
        query = query.neq("status", "archived");
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as StoryJob[];
    },
    refetchInterval: 10000,
  });

  // Archive/unarchive mutation
  const archiveMutation = useMutation({
    mutationFn: async ({ storyId, archive }: { storyId: string; archive: boolean }) => {
      const { error } = await supabase
        .from("story_jobs")
        .update({ status: archive ? "archived" : "draft" })
        .eq("id", storyId);

      if (error) throw error;
    },
    onSuccess: (_, { archive }) => {
      queryClient.invalidateQueries({ queryKey: ["story-library"] });
      toast({
        title: archive ? "Story archived" : "Story restored",
        description: archive 
          ? "The story has been moved to archives." 
          : "The story has been restored.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update story. Please try again.",
        variant: "destructive",
      });
      console.error("Archive mutation error:", error);
    },
  });

  // Fetch all video_jobs for these stories
  const storyIds = stories?.map((s) => s.id) || [];
  const { data: allClips } = useQuery({
    queryKey: ["story-clips-library", storyIds.join(",")],
    queryFn: async () => {
      if (!storyIds.length) return [];
      const { data, error } = await supabase
        .from("video_jobs")
        .select("*")
        .in("story_job_id", storyIds)
        .order("sequence_index", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as VideoJob[];
    },
    enabled: storyIds.length > 0,
    refetchInterval: 5000,
  });

  // Group clips by story and deduplicate per sequence_index
  const storiesWithClips: StoryWithClips[] = (stories || []).map((story) => {
    const storyClips = (allClips || []).filter(
      (c) => c.story_job_id === story.id
    );

    // Deduplicate: keep best clip per sequence_index
    const clipsByIndex = new Map<number, VideoJob>();
    for (const clip of storyClips) {
      const idx = clip.sequence_index ?? -1;
      const existing = clipsByIndex.get(idx);

      if (!existing) {
        clipsByIndex.set(idx, clip);
        continue;
      }

      // Priority: done > running > failed
      const statusPriority = (status: string) => {
        if (status === "done" || status === "rendered") return 3;
        if (status === "running" || status === "queued") return 2;
        return 1;
      };

      const existingP = statusPriority(existing.status);
      const newP = statusPriority(clip.status);

      if (newP > existingP) {
        clipsByIndex.set(idx, clip);
      } else if (newP === existingP) {
        if (new Date(clip.created_at) > new Date(existing.created_at)) {
          clipsByIndex.set(idx, clip);
        }
      }
    }

    return {
      ...story,
      clips: Array.from(clipsByIndex.values()).sort(
        (a, b) => (a.sequence_index ?? 0) - (b.sequence_index ?? 0)
      ),
    };
  });

  const toggleStoryExpanded = (storyId: string) => {
    const newSet = new Set(expandedStories);
    if (newSet.has(storyId)) {
      newSet.delete(storyId);
    } else {
      newSet.add(storyId);
    }
    setExpandedStories(newSet);
  };

  const getStatusBadge = (story: StoryWithClips) => {
    const doneCount = story.clips.filter((c) => c.status === "done").length;
    const runningCount = story.clips.filter(
      (c) => c.status === "running" || c.status === "queued"
    ).length;
    const total = story.total_clips || story.clips.length;

    if (story.status === "done" || doneCount >= total) {
      return (
        <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
          <CheckCircle className="h-3 w-3 mr-1" />
          Complete
        </Badge>
      );
    }

    if (runningCount > 0 || story.status === "generating") {
      return (
        <Badge variant="outline" className="text-[10px] border-accent/50 text-accent-foreground animate-pulse">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          {doneCount}/{total}
        </Badge>
      );
    }

    if (story.status === "draft") {
      return (
        <Badge variant="secondary" className="text-[10px]">
          Draft
        </Badge>
      );
    }

    return null;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <div className="flex items-center justify-between px-2 py-1">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="flex-1 justify-start px-2 py-2 h-auto hover:bg-secondary/50"
          >
            <div className="flex items-center gap-2">
              {isOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <Film className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Story Library</span>
              {stories && (
                <Badge variant="secondary" className="text-xs">
                  {stories.length}
                </Badge>
              )}
            </div>
          </Button>
        </CollapsibleTrigger>
        
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={(e) => {
              e.stopPropagation();
              setShowArchived(!showArchived);
            }}
            title={showArchived ? "Hide archived" : "Show archived"}
          >
            {showArchived ? (
              <EyeOff className="h-3 w-3 text-muted-foreground" />
            ) : (
              <Eye className="h-3 w-3 text-muted-foreground" />
            )}
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 gap-1"
            onClick={(e) => {
              e.stopPropagation();
              // Navigate to unified stories workspace
              navigate("/stories?new=true");
            }}
          >
            <Plus className="h-3 w-3" />
            <span className="text-xs">New</span>
          </Button>
        </div>
      </div>

      <CollapsibleContent>
        <div className="border-t border-border/50">
          {storiesLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading stories...
            </div>
          ) : !storiesWithClips?.length ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No stories yet
            </div>
          ) : (
            <ScrollArea className="h-[300px]">
              <div className="space-y-2 p-2">
                {storiesWithClips.map((story) => (
                  <StoryCard
                    key={story.id}
                    story={story}
                    isActive={activeStoryId === story.id}
                    isExpanded={expandedStories.has(story.id)}
                    onToggleExpand={() => toggleStoryExpanded(story.id)}
                    onSelect={() => onSelectStory?.(story.id)}
                    onArchive={(archive) => archiveMutation.mutate({ storyId: story.id, archive })}
                    isArchiving={archiveMutation.isPending}
                    statusBadge={getStatusBadge(story)}
                    formatDate={formatDate}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface StoryCardProps {
  story: StoryWithClips;
  isActive: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSelect: () => void;
  onArchive: (archive: boolean) => void;
  isArchiving: boolean;
  statusBadge: React.ReactNode;
  formatDate: (dateStr: string) => string;
}

function StoryCard({
  story,
  isActive,
  isExpanded,
  onToggleExpand,
  onSelect,
  onArchive,
  isArchiving,
  statusBadge,
  formatDate,
}: StoryCardProps) {
  const isArchived = story.status === "archived";
  const doneCount = story.clips.filter((c) => c.status === "done").length;
  const total = story.total_clips || story.clips.length || 1;
  const progress = Math.round((doneCount / total) * 100);

  return (
    <div
      className={cn(
        "rounded-lg border transition-all",
        isArchived && "opacity-60",
        isActive
          ? "border-primary bg-primary/5"
          : "border-border/50 hover:border-border"
      )}
    >
      {/* Story Header */}
      <div className="group">
      <div className="p-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onToggleExpand}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </Button>

          <Link
            to={`/stories/${story.id}`}
            className="flex-1 min-w-0"
            onClick={onSelect}
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">
                {story.title || "Untitled Story"}
              </span>
              {isArchived ? (
                <Badge variant="secondary" className="text-[10px]">
                  <Archive className="h-2.5 w-2.5 mr-0.5" />
                  Archived
                </Badge>
              ) : (
                statusBadge
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <Clock className="h-3 w-3" />
              {formatDate(story.created_at)}
              <span>•</span>
              <span>{total} scenes</span>
            </div>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
                disabled={isArchiving}
              >
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive(!isArchived);
                }}
                disabled={isArchiving}
              >
                {isArchived ? (
                  <>
                    <ArchiveRestore className="h-3.5 w-3.5 mr-2" />
                    Restore
                  </>
                ) : (
                  <>
                    <Archive className="h-3.5 w-3.5 mr-2" />
                    Archive
                  </>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

      </div>

        {/* Progress bar */}
        {story.status === "generating" && (
          <Progress value={progress} className="h-1 mt-2" />
        )}
      </div>

      {/* Expanded: Show clip filmstrip */}
      {isExpanded && story.clips.length > 0 && (
        <div className="border-t border-border/30 p-2">
          <div className="flex gap-1 overflow-x-auto pb-1">
            {story.clips.map((clip) => (
              <ClipThumbnail
                key={clip.id}
                clip={clip}
                formatDate={formatDate}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ClipThumbnailProps {
  clip: VideoJob;
  formatDate: (dateStr: string) => string;
}

function ClipThumbnail({ clip, formatDate }: ClipThumbnailProps) {
  const getStatusIcon = () => {
    switch (clip.status) {
      case "done":
      case "rendered":
        return <CheckCircle className="h-3 w-3 text-primary" />;
      case "running":
      case "queued":
        return <Loader2 className="h-3 w-3 text-accent-foreground animate-spin" />;
      case "failed":
        return <AlertCircle className="h-3 w-3 text-destructive" />;
      default:
        return null;
    }
  };

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          className={cn(
            "relative flex-shrink-0 w-12 aspect-[9/16] rounded overflow-hidden",
            "bg-secondary/50 hover:ring-2 hover:ring-primary/50 transition-all",
            "focus:outline-none focus:ring-2 focus:ring-primary"
          )}
        >
          {clip.thumbnail_url ? (
            <img
              src={clip.thumbnail_url}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-secondary/50">
              <Film className="h-3 w-3 text-muted-foreground/50" />
            </div>
          )}

          {/* Scene number badge */}
          <div className="absolute top-0.5 left-0.5 bg-black/70 rounded text-[8px] px-1 text-white">
            {(clip.sequence_index ?? 0) + 1}
          </div>

          {/* Status icon */}
          <div className="absolute bottom-0.5 right-0.5">{getStatusIcon()}</div>

          {/* Play overlay for done clips */}
          {(clip.status === "done" || clip.status === "rendered") &&
            clip.output_url && (
              <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                <Play className="h-4 w-4 text-white" />
              </div>
            )}
        </button>
      </HoverCardTrigger>

      <HoverCardContent side="top" align="center" className="w-64 p-2">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-[10px]">
              Scene {(clip.sequence_index ?? 0) + 1}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {formatDate(clip.created_at)}
            </span>
          </div>

          {clip.original_prompt && (
            <p className="text-xs text-muted-foreground line-clamp-3">
              {clip.original_prompt}
            </p>
          )}

          <div className="flex items-center gap-1 text-[10px]">
            {getStatusIcon()}
            <span className="capitalize">{clip.status}</span>
            {clip.provider && (
              <>
                <span>•</span>
                <span className="text-muted-foreground">{clip.provider}</span>
              </>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
