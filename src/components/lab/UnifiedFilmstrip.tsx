import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Film, Star, Loader2, X, Clock, Filter, Sparkles, Target, Heart, Scale, Check, ChevronUp, ChevronDown, Grid3X3, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import type { LabResult } from "./LabGeneratePanel";

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
  is_serendipity: boolean | null;
  human_match_rating: number | null;
  human_preference_rating: number | null;
  rated_at: string | null;
}

interface UnifiedFilmstripProps {
  sessionResults: LabResult[];
  activeResultId: string | null;
  onSelectResult: (id: string) => void;
  onSelectLibraryVideo: (jobId: string, url: string, provider: string) => void;
  className?: string;
  compareJobIdA?: string | null;
  compareJobIdB?: string | null;
  onSetCompareA?: (id: string | null) => void;
  onSetCompareB?: (id: string | null) => void;
  onGoToCompare?: () => void;
}

type FilterView = "session" | "all" | "rated" | "unrated" | "discoveries";
type ProviderFilter = "all" | "sora" | "runway" | "luma";

export function UnifiedFilmstrip({
  sessionResults,
  activeResultId,
  onSelectResult,
  onSelectLibraryVideo,
  className,
  compareJobIdA,
  compareJobIdB,
  onSetCompareA,
  onSetCompareB,
  onGoToCompare,
}: UnifiedFilmstripProps) {
  const [filterView, setFilterView] = useState<FilterView>("session");
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");
  const [isExpanded, setIsExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<"row" | "grid">("row");

  const { data: libraryVideos } = useQuery({
    queryKey: ["video-library-filmstrip", filterView],
    queryFn: async () => {
      let query = supabase
        .from("video_jobs")
        .select("id, provider, status, output_url, thumbnail_url, created_at, accuracy_rating, original_prompt, enriched_prompt, is_serendipity, human_match_rating, human_preference_rating, rated_at")
        .eq("status", "done")
        .not("output_url", "is", null);
      
      if (filterView === "discoveries") {
        query = query.eq("is_serendipity", true);
      }
      
      query = query.order("created_at", { ascending: false }).limit(50);

      const { data, error } = await query;
      if (error) throw error;
      return data as VideoJob[];
    },
    refetchInterval: 10000,
    enabled: filterView !== "session",
  });

  const displayItems = useMemo(() => {
    if (filterView === "session") {
      return sessionResults
        .filter(r => r.type === "video")
        .filter(r => providerFilter === "all" || r.engine === providerFilter)
        .map(r => ({
          type: "session" as const,
          id: r.id,
          provider: r.engine,
          status: r.status,
          outputUrl: r.outputUrl,
          thumbnailUrl: r.thumbnailUrl,
          progress: r.progress,
          rating: null as number | null,
          originalPrompt: r.prompt,
        }));
    }

    let filtered = libraryVideos || [];
    
    if (providerFilter !== "all") {
      filtered = filtered.filter(v => v.provider === providerFilter);
    }
    
    if (filterView === "rated") {
      filtered = filtered.filter(v => v.accuracy_rating !== null || v.human_match_rating !== null);
    } else if (filterView === "unrated") {
      filtered = filtered.filter(v => v.accuracy_rating === null && v.human_match_rating === null);
    }

    return filtered.map(v => ({
      type: "library" as const,
      id: v.id,
      provider: v.provider,
      status: v.status,
      outputUrl: v.output_url,
      thumbnailUrl: v.thumbnail_url,
      progress: 100,
      rating: v.accuracy_rating,
      originalPrompt: v.original_prompt,
      enrichedPrompt: v.enriched_prompt,
      createdAt: v.created_at,
      isSerendipity: v.is_serendipity,
      humanMatchRating: v.human_match_rating,
      humanPreferenceRating: v.human_preference_rating,
    }));
  }, [filterView, providerFilter, sessionResults, libraryVideos]);

  const activeJobCount = sessionResults.filter(
    r => r.type === "video" && (r.status === "queued" || r.status === "running")
  ).length;

  const getEngineColor = (engine: string) => {
    const colors: Record<string, string> = {
      sora: "bg-primary/20 text-primary border-primary/30",
      runway: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      luma: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    };
    return colors[engine] || "bg-secondary text-secondary-foreground";
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "";
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

  const handleClick = (item: typeof displayItems[0]) => {
    if (item.type === "session") {
      onSelectResult(item.id);
    } else if (item.outputUrl) {
      onSelectLibraryVideo(item.id, item.outputUrl, item.provider);
    }
  };

  const renderThumbnail = (item: typeof displayItems[0]) => (
    <HoverCard key={item.id} openDelay={300}>
      <HoverCardTrigger asChild>
        <button
          onClick={() => handleClick(item)}
          className={cn(
            "flex-shrink-0 w-14 rounded-md overflow-hidden border-2 transition-all hover:scale-105",
            activeResultId === item.id
              ? "border-primary ring-2 ring-primary/30 shadow-lg shadow-primary/20"
              : "border-border/50 hover:border-primary/50"
          )}
        >
          <div className="aspect-[9/16] bg-black/50 relative flex items-center justify-center">
            {item.status === "done" && item.thumbnailUrl ? (
              <img src={item.thumbnailUrl} alt="" className="w-full h-full object-cover" />
            ) : item.status === "done" && item.outputUrl ? (
              <video src={item.outputUrl} className="w-full h-full object-cover" muted />
            ) : item.status === "failed" ? (
              <X className="h-4 w-4 text-destructive" />
            ) : (
              <div className="flex flex-col items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                <span className="text-[8px] font-medium text-muted-foreground">{item.progress}%</span>
              </div>
            )}

            {(item.status === "running" || item.status === "queued") && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/70">
                <div className="h-full bg-primary transition-all duration-300" style={{ width: `${item.progress}%` }} />
              </div>
            )}

            <span className={cn("absolute top-0.5 left-0.5 text-[6px] px-0.5 py-0.5 rounded font-semibold uppercase", getEngineColor(item.provider))}>
              {item.provider.slice(0, 3)}
            </span>

            {((item as any).humanMatchRating || item.rating) && (
              <div className="absolute top-0.5 right-0.5 flex items-center gap-0.5 bg-black/60 rounded px-0.5">
                {(item as any).humanMatchRating ? (
                  <>
                    <Target className="h-2 w-2 text-primary" />
                    <span className="text-[7px] text-white">{(item as any).humanMatchRating}</span>
                  </>
                ) : (
                  <>
                    <Star className="h-2 w-2 fill-warning text-warning" />
                    <span className="text-[7px] text-white">{item.rating}</span>
                  </>
                )}
              </div>
            )}

            {(item as any).isSerendipity && (
              <div className="absolute bottom-0.5 right-0.5">
                <Sparkles className="h-2.5 w-2.5 text-warning" />
              </div>
            )}

            {item.status === "done" && !item.rating && !(item as any).humanMatchRating && (
              <div className="absolute top-0.5 right-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-success" />
              </div>
            )}

            {compareJobIdA === item.id && (
              <div className="absolute bottom-0.5 left-0.5 bg-primary text-primary-foreground text-[7px] font-bold px-1 py-0.5 rounded">A</div>
            )}
            {compareJobIdB === item.id && (
              <div className="absolute bottom-0.5 left-0.5 bg-primary text-primary-foreground text-[7px] font-bold px-1 py-0.5 rounded">B</div>
            )}
          </div>
        </button>
      </HoverCardTrigger>

      {item.type === "library" && (
        <HoverCardContent side="top" className="w-64 p-2 bg-popover">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Badge className={cn("text-[10px] uppercase", getEngineColor(item.provider))}>{item.provider}</Badge>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {formatDate((item as any).createdAt)}
              </span>
            </div>
            {item.originalPrompt && <p className="text-xs line-clamp-3">{item.originalPrompt}</p>}
            {((item as any).humanMatchRating || item.rating) && (
              <div className="flex items-center gap-2 pt-1 border-t border-border">
                {(item as any).humanMatchRating ? (
                  <>
                    <div className="flex items-center gap-0.5">
                      <Target className="h-3 w-3 text-primary" />
                      <span className="text-[10px]">{(item as any).humanMatchRating}/5</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Heart className="h-3 w-3 text-destructive" />
                      <span className="text-[10px]">{(item as any).humanPreferenceRating}/5</span>
                    </div>
                    {(item as any).isSerendipity && (
                      <Badge variant="outline" className="text-[9px] h-4 bg-warning/20 text-warning border-warning/30">
                        <Sparkles className="h-2 w-2 mr-0.5" />Discovery
                      </Badge>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className={cn("h-2.5 w-2.5", s <= item.rating! ? "fill-warning text-warning" : "text-muted-foreground/30")} />
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {onSetCompareA && onSetCompareB && item.status === "done" && (
              <div className="flex items-center gap-1.5 pt-2 border-t border-border mt-2">
                <Button size="sm" variant={compareJobIdA === item.id ? "default" : "outline"} className="h-6 text-[10px] flex-1 gap-1" onClick={(e) => { e.stopPropagation(); onSetCompareA(compareJobIdA === item.id ? null : item.id); }}>
                  {compareJobIdA === item.id && <Check className="h-2.5 w-2.5" />}Set A
                </Button>
                <Button size="sm" variant={compareJobIdB === item.id ? "default" : "outline"} className="h-6 text-[10px] flex-1 gap-1" onClick={(e) => { e.stopPropagation(); onSetCompareB(compareJobIdB === item.id ? null : item.id); }}>
                  {compareJobIdB === item.id && <Check className="h-2.5 w-2.5" />}Set B
                </Button>
                {compareJobIdA && compareJobIdB && compareJobIdA !== compareJobIdB && onGoToCompare && (
                  <Button size="sm" variant="default" className="h-6 text-[10px] gap-1" onClick={(e) => { e.stopPropagation(); onGoToCompare(); }}>
                    <Scale className="h-2.5 w-2.5" />Compare
                  </Button>
                )}
              </div>
            )}
          </div>
        </HoverCardContent>
      )}
    </HoverCard>
  );

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded} className="shrink-0">
      <div className={cn(
        "border-t border-primary/30 bg-card/50 transition-all overflow-hidden flex flex-col",
        isExpanded ? "h-[200px]" : "h-[100px]",
        className
      )}>
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-1 border-b border-border/50">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-1.5 gap-1">
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />}
              <Film className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </CollapsibleTrigger>
          
          <span className="text-xs font-medium">Videos</span>
          <Badge variant="outline" className="text-[10px] h-5 px-1.5">{displayItems.length}</Badge>
          
          {activeJobCount > 0 && (
            <Badge variant="secondary" className="text-[10px] h-5 bg-primary/20 text-primary">{activeJobCount} generating</Badge>
          )}

          <div className="flex-1" />

          <div className="flex border rounded-md overflow-hidden">
            <Button size="sm" variant={viewMode === "row" ? "secondary" : "ghost"} className="h-5 px-1.5 rounded-none" onClick={() => setViewMode("row")}>
              <LayoutList className="h-3 w-3" />
            </Button>
            <Button size="sm" variant={viewMode === "grid" ? "secondary" : "ghost"} className="h-5 px-1.5 rounded-none" onClick={() => setViewMode("grid")}>
              <Grid3X3 className="h-3 w-3" />
            </Button>
          </div>

          <div className="flex gap-1">
            {(["session", "all", "discoveries", "rated", "unrated"] as const).map((view) => (
              <Button key={view} size="sm" variant={filterView === view ? "secondary" : "ghost"} className={cn("h-5 px-2 text-[10px] gap-1", view === "discoveries" && filterView === view && "bg-warning/20 text-warning")} onClick={() => setFilterView(view)}>
                {view === "discoveries" && <Sparkles className="h-3 w-3" />}
                {view === "session" ? "Session" : view === "all" ? "All" : view === "rated" ? "★" : view === "unrated" ? "○" : "✨"}
              </Button>
            ))}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-5 px-2 text-[10px] gap-1">
                <Filter className="h-3 w-3" />
                {providerFilter === "all" ? "All" : providerFilter}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32 bg-popover">
              <DropdownMenuLabel className="text-xs">Provider</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(["all", "sora", "runway", "luma"] as const).map((p) => (
                <DropdownMenuCheckboxItem key={p} checked={providerFilter === p} onCheckedChange={() => setProviderFilter(p)} className="text-xs">
                  {p === "all" ? "All Providers" : p.charAt(0).toUpperCase() + p.slice(1)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="hidden md:flex items-center gap-2 text-[10px] text-muted-foreground ml-2">
            <kbd className="px-1 py-0.5 rounded bg-muted text-[9px] font-mono">←→</kbd>
          </div>
        </div>

        {/* Content */}
        <div className="p-1.5 overflow-hidden flex-1 min-h-0">
          {displayItems.length === 0 ? (
            <div className="text-center py-3 text-xs text-muted-foreground">
              {filterView === "session" ? "Generate videos to see them here" : "No videos found"}
            </div>
          ) : viewMode === "grid" ? (
            <ScrollArea className="w-full h-full">
              <div className="flex flex-wrap gap-1.5 p-0.5">
                {displayItems.map(renderThumbnail)}
              </div>
            </ScrollArea>
          ) : (
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex gap-1.5 p-0.5">
                {displayItems.map(renderThumbnail)}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          )}
        </div>
      </div>
    </Collapsible>
  );
}
