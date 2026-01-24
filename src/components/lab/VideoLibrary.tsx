import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Film, Clock, Star, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface VideoJob {
  id: string;
  provider: string;
  status: string;
  output_url: string | null;
  thumbnail_url: string | null;
  created_at: string;
  accuracy_rating: number | null;
  original_prompt: string | null;
  enriched_prompt: string | null;
  settings: Record<string, unknown> | null;
}

interface VideoLibraryProps {
  onSelectVideo?: (url: string, provider: string) => void;
  className?: string;
}

export function VideoLibrary({ onSelectVideo, className }: VideoLibraryProps) {
  const [isOpen, setIsOpen] = useState(true);

  const { data: videos, isLoading } = useQuery({
    queryKey: ["video-library"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("video_jobs")
        .select("id, provider, status, output_url, thumbnail_url, created_at, accuracy_rating, original_prompt, enriched_prompt, settings")
        .eq("status", "done")
        .not("output_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as VideoJob[];
    },
    refetchInterval: 10000, // Refresh every 10s
  });

  const getProviderColor = (provider: string) => {
    switch (provider) {
      case "sora": return "bg-green-500/20 text-green-400 border-green-500/30";
      case "runway": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "luma": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      default: return "bg-secondary text-secondary-foreground";
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getPromptPreview = (video: VideoJob) => {
    const prompt = video.original_prompt || video.enriched_prompt || "";
    return prompt.length > 60 ? prompt.slice(0, 60) + "..." : prompt;
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-between px-3 py-2 h-auto hover:bg-secondary/50"
        >
          <div className="flex items-center gap-2">
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <Film className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Video Library</span>
            {videos && (
              <Badge variant="secondary" className="text-xs">
                {videos.length}
              </Badge>
            )}
          </div>
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-t border-border/50">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading videos...
            </div>
          ) : !videos?.length ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No completed videos yet
            </div>
          ) : (
            <ScrollArea className="h-[200px]">
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2 p-2">
                {videos.map((video) => (
                  <button
                    key={video.id}
                    onClick={() => video.output_url && onSelectVideo?.(video.output_url, video.provider)}
                    className={cn(
                      "group relative aspect-[9/16] rounded-md overflow-hidden",
                      "bg-secondary/50 hover:ring-2 hover:ring-primary/50 transition-all",
                      "focus:outline-none focus:ring-2 focus:ring-primary"
                    )}
                    title={getPromptPreview(video)}
                  >
                    {/* Thumbnail or placeholder */}
                    {video.thumbnail_url ? (
                      <img
                        src={video.thumbnail_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-secondary/50">
                        <Film className="h-4 w-4 text-muted-foreground/50" />
                      </div>
                    )}

                    {/* Provider badge */}
                    <Badge
                      className={cn(
                        "absolute top-1 left-1 text-[9px] px-1 py-0 h-4 uppercase font-medium",
                        getProviderColor(video.provider)
                      )}
                    >
                      {video.provider.slice(0, 4)}
                    </Badge>

                    {/* Rating stars */}
                    {video.accuracy_rating && (
                      <div className="absolute top-1 right-1 flex items-center gap-0.5 bg-black/60 rounded px-1">
                        <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                        <span className="text-[9px] text-white">{video.accuracy_rating}</span>
                      </div>
                    )}

                    {/* Time overlay on hover */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                      <ExternalLink className="h-4 w-4 text-white" />
                      <div className="flex items-center gap-1 text-[10px] text-white/80">
                        <Clock className="h-2.5 w-2.5" />
                        {formatDate(video.created_at)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
