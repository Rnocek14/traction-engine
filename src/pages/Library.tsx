import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Film,
  Clock,
  Star,
  Play,
  Search,
  Filter,
  X,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List,
  SlidersHorizontal,
  Sparkles,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface VideoJob {
  id: string;
  provider: string;
  status: string;
  output_url: string | null;
  thumbnail_url: string | null;
  spritesheet_url: string | null;
  created_at: string;
  accuracy_rating: number | null;
  original_prompt: string | null;
  enriched_prompt: string | null;
  settings: Record<string, unknown> | null;
  auto_overall_score: number | null;
  auto_quality_score: number | null;
  auto_match_score: number | null;
  auto_motion_score: number | null;
  auto_cinematic_score: number | null;
  auto_routing_tags: string[] | null;
  auto_best_use: string | null;
  error: string | null;
}

const PROVIDERS = ["all", "sora", "runway", "luma"] as const;
const STATUSES = ["all", "done", "succeeded", "failed", "running", "queued"] as const;
const PAGE_SIZE = 60;

export default function LibraryPage() {
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "rating" | "score">("newest");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const { data: videos, isLoading, error: queryError } = useQuery({
    queryKey: ["video-library", providerFilter, statusFilter, sortBy, page],
    queryFn: async () => {
      // Lightweight columns only — heavy fields (enriched_prompt, settings) loaded on demand
      let q = supabase
        .from("video_jobs")
        .select(
          "id, provider, status, output_url, thumbnail_url, created_at, accuracy_rating, original_prompt, auto_overall_score, auto_routing_tags, auto_best_use, error"
        );

      if (providerFilter !== "all") q = q.eq("provider", providerFilter);
      if (statusFilter !== "all") {
        if (statusFilter === "done") q = q.in("status", ["done", "succeeded"]);
        else q = q.eq("status", statusFilter);
      }

      const ascending = sortBy === "oldest";
      const orderCol =
        sortBy === "rating" ? "accuracy_rating" : sortBy === "score" ? "auto_overall_score" : "created_at";

      const { data, error } = await q
        .order(orderCol, { ascending, nullsFirst: false })
        .range(0, page * PAGE_SIZE - 1);

      if (error) throw error;
      return (data || []) as unknown as VideoJob[];
    },
  });

  const filtered = useMemo(() => {
    if (!videos) return [];
    if (!search.trim()) return videos;
    const qStr = search.toLowerCase();
    return videos.filter(
      (v) =>
        (v.original_prompt?.toLowerCase().includes(qStr) ?? false) ||
        (v.auto_best_use?.toLowerCase().includes(qStr) ?? false) ||
        (v.provider?.toLowerCase().includes(qStr) ?? false)
    );
  }, [videos, search]);

  const paginated = filtered;
  const hasMore = (videos?.length ?? 0) >= page * PAGE_SIZE;

  const getProviderColor = (provider: string) => {
    switch (provider) {
      case "sora":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "runway":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "luma":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      default:
        return "bg-secondary text-secondary-foreground";
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

  const completedCount = videos?.filter((v) => v.status === "done" || v.status === "succeeded").length ?? 0;
  const failedCount = videos?.filter((v) => v.status === "failed").length ?? 0;
  const activeCount = videos?.filter((v) => ["running", "queued", "rendering"].includes(v.status)).length ?? 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-semibold flex items-center gap-2">
                <Film className="h-6 w-6 text-primary" />
                Video Library
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {videos?.length ?? 0} total videos · {completedCount} completed · {activeCount} active ·{" "}
                {failedCount} failed
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
              >
                {viewMode === "grid" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Search + Filter bar */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search prompts, providers, tags..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            <Button
              variant={showFilters ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {(providerFilter !== "all" || statusFilter !== "all") && (
                <Badge variant="secondary" className="h-5 text-[10px]">
                  {(providerFilter !== "all" ? 1 : 0) + (statusFilter !== "all" ? 1 : 0)}
                </Badge>
              )}
            </Button>
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div className="mt-3 p-3 border rounded-lg bg-muted/30 space-y-3">
              {/* Provider filter */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-muted-foreground uppercase">Provider</span>
                {PROVIDERS.map((p) => (
                  <Button
                    key={p}
                    variant={providerFilter === p ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs capitalize"
                    onClick={() => setProviderFilter(p)}
                  >
                    {p}
                  </Button>
                ))}
              </div>

              {/* Status filter */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-muted-foreground uppercase">Status</span>
                {STATUSES.map((s) => (
                  <Button
                    key={s}
                    variant={statusFilter === s ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs capitalize"
                    onClick={() => setStatusFilter(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>

              {/* Sort */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-muted-foreground uppercase">Sort</span>
                {(["newest", "oldest", "rating", "score"] as const).map((s) => (
                  <Button
                    key={s}
                    variant={sortBy === s ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs capitalize"
                    onClick={() => setSortBy(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Active filter chips */}
          {(providerFilter !== "all" || statusFilter !== "all") && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {providerFilter !== "all" && (
                <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setProviderFilter("all")}>
                  Provider: {providerFilter} <X className="h-3 w-3" />
                </Badge>
              )}
              {statusFilter !== "all" && (
                <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setStatusFilter("all")}>
                  Status: {statusFilter} <X className="h-3 w-3" />
                </Badge>
              )}
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setProviderFilter("all"); setStatusFilter("all"); setSearch(""); }}>
                Clear all
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Film className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">No videos match your filters</p>
            {(providerFilter !== "all" || statusFilter !== "all" || search) && (
              <Button variant="link" size="sm" onClick={() => { setProviderFilter("all"); setStatusFilter("all"); setSearch(""); }}>
                Clear filters
              </Button>
            )}
          </div>
        ) : viewMode === "grid" ? (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
              {paginated.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  onPreview={() => video.output_url && setPreviewUrl(video.output_url)}
                />
              ))}
            </div>
            {hasMore && (
              <div className="flex justify-center mt-8">
                <Button variant="outline" onClick={() => setPage((p) => p + 1)}>
                  Load more
                </Button>
              </div>
            )}
          </>
        ) : (
          <ScrollArea className="h-[calc(100vh-220px)]">
            <div className="space-y-2">
              {paginated.map((video) => (
                <VideoListRow
                  key={video.id}
                  video={video}
                  onPreview={() => video.output_url && setPreviewUrl(video.output_url)}
                  getProviderColor={getProviderColor}
                  formatDate={formatDate}
                />
              ))}
            </div>
            {hasMore && (
              <div className="flex justify-center mt-4 pb-4">
                <Button variant="outline" onClick={() => setPage((p) => p + 1)}>
                  Load more
                </Button>
              </div>
            )}
          </ScrollArea>
        )}

        <p className="text-xs text-muted-foreground mt-4 text-center">
          Showing {paginated.length} of {filtered.length} filtered ({videos?.length ?? 0} total)
        </p>
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="text-sm font-medium">Video Preview</DialogTitle>
          </DialogHeader>
          <div className="p-4 pt-2">
            {previewUrl && (
              <video
                src={previewUrl}
                controls
                autoPlay
                className="w-full rounded-lg"
                style={{ maxHeight: "70vh" }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VideoCard({ video, onPreview }: { video: VideoJob; onPreview: () => void }) {
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

  const isCompleted = video.status === "done" || video.status === "succeeded";
  const isFailed = video.status === "failed";

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          onClick={onPreview}
          className={cn(
            "group relative aspect-[9/16] rounded-lg overflow-hidden",
            "bg-secondary/50 hover:ring-2 hover:ring-primary/50 transition-all",
            "focus:outline-none focus:ring-2 focus:ring-primary"
          )}
        >
          {video.thumbnail_url ? (
            <img src={video.thumbnail_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-secondary/50">
              {isFailed ? (
                <AlertTriangle className="h-5 w-5 text-destructive/60" />
              ) : (
                <Film className="h-5 w-5 text-muted-foreground/40" />
              )}
            </div>
          )}

          {/* Provider badge */}
          <Badge
            className={cn(
              "absolute top-1.5 left-1.5 text-[9px] px-1 py-0 h-4 uppercase font-medium",
              getProviderColor(video.provider)
            )}
          >
            {video.provider.slice(0, 4)}
          </Badge>

          {/* Status indicator for non-completed */}
          {!isCompleted && !isFailed && (
            <div className="absolute top-1.5 right-1.5">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
            </div>
          )}

          {/* Rating */}
          {video.accuracy_rating && (
            <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 bg-black/60 rounded px-1">
              <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
              <span className="text-[9px] text-white">{video.accuracy_rating}</span>
            </div>
          )}

          {/* Auto score */}
          {video.auto_overall_score && !video.accuracy_rating && (
            <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 bg-black/60 rounded px-1">
              <Sparkles className="h-2.5 w-2.5 text-primary" />
              <span className="text-[9px] text-white">{video.auto_overall_score}</span>
            </div>
          )}

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
            <Play className="h-6 w-6 text-white" />
            <div className="flex items-center gap-1 text-[10px] text-white/80">
              <Clock className="h-2.5 w-2.5" />
              {formatDate(video.created_at)}
            </div>
          </div>

          {/* Bottom gradient */}
          <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
        </button>
      </HoverCardTrigger>

      <HoverCardContent side="top" align="center" className="w-80 p-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Badge className={cn("text-xs uppercase", getProviderColor(video.provider))}>
              {video.provider}
            </Badge>
            <span className="text-xs text-muted-foreground">{formatDate(video.created_at)}</span>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={cn("capitalize", isCompleted ? "text-success" : isFailed ? "text-destructive" : "text-primary")}>
              {video.status}
            </span>
            {video.auto_overall_score && <span>· Auto: {video.auto_overall_score}</span>}
            {video.accuracy_rating && <span>· Rated: {video.accuracy_rating}/5</span>}
          </div>

          {video.original_prompt && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Prompt</p>
              <p className="text-sm leading-relaxed line-clamp-4">{video.original_prompt}</p>
            </div>
          )}

          {video.enriched_prompt && video.enriched_prompt !== video.original_prompt && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Enriched</p>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                {video.enriched_prompt}
              </p>
            </div>
          )}

          {video.auto_routing_tags && video.auto_routing_tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {video.auto_routing_tags.slice(0, 6).map((tag) => (
                <Badge key={tag} variant="outline" className="text-[9px] h-5">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {video.error && (
            <p className="text-xs text-destructive line-clamp-2">{video.error}</p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function VideoListRow({
  video,
  onPreview,
  getProviderColor,
  formatDate,
}: {
  video: VideoJob;
  onPreview: () => void;
  getProviderColor: (p: string) => string;
  formatDate: (d: string) => string;
}) {
  const isCompleted = video.status === "done" || video.status === "succeeded";

  return (
    <div
      onClick={onPreview}
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border cursor-pointer",
        "hover:bg-muted/50 transition-colors"
      )}
    >
      {/* Thumbnail */}
      <div className="relative w-12 h-20 rounded-md overflow-hidden flex-shrink-0 bg-secondary">
        {video.thumbnail_url ? (
          <img src={video.thumbnail_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="h-4 w-4 text-muted-foreground/40" />
          </div>
        )}
        {isCompleted && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity">
            <Play className="h-5 w-5 text-white" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge className={cn("text-[10px] h-5 uppercase", getProviderColor(video.provider))}>
            {video.provider}
          </Badge>
          <span className="text-xs text-muted-foreground capitalize">{video.status}</span>
          <span className="text-xs text-muted-foreground">· {formatDate(video.created_at)}</span>
        </div>
        <p className="text-sm truncate">
          {video.original_prompt || video.enriched_prompt || "No prompt available"}
        </p>
        {video.auto_best_use && (
          <p className="text-xs text-muted-foreground mt-0.5">{video.auto_best_use}</p>
        )}
      </div>

      {/* Scores */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
        {video.accuracy_rating && (
          <div className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            {video.accuracy_rating}
          </div>
        )}
        {video.auto_overall_score && <span>Auto: {video.auto_overall_score}</span>}
        {video.auto_quality_score && <span>Q: {video.auto_quality_score}</span>}
        {video.auto_match_score && <span>M: {video.auto_match_score}</span>}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {video.output_url && (
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <a href={video.output_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
