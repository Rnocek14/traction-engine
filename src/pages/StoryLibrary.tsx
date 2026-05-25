import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Film,
  Search,
  X,
  Loader2,
  AlertTriangle,
  SlidersHorizontal,
  Play,
  Clock,
  CheckCircle2,
  XCircle,
  Layers,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { GlobalNav } from "@/components/GlobalNav";
import { cn } from "@/lib/utils";

interface StoryJob {
  id: string;
  account_id: string | null;
  title: string | null;
  story_type: string | null;
  status: string;
  total_clips: number | null;
  completed_clips: number | null;
  continuity_score: number | null;
  assembled_video_url: string | null;
  assembled_status: string | null;
  review_status: string | null;
  content_type: string | null;
  created_at: string;
  updated_at: string | null;
}

const STATUSES = ["all", "done", "partial", "draft", "generating", "failed"] as const;
const PAGE_SIZE = 40;

export default function StoryLibraryPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "continuity">("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [preview, setPreview] = useState<StoryJob | null>(null);
  const [page, setPage] = useState(1);

  const { data: stories, isLoading, error: queryError } = useQuery({
    queryKey: ["story-library", statusFilter, sortBy, page],
    queryFn: async () => {
      let q = supabase
        .from("story_jobs")
        .select(
          "id, account_id, title, story_type, status, total_clips, completed_clips, continuity_score, assembled_video_url, assembled_status, review_status, content_type, created_at, updated_at"
        );

      if (statusFilter !== "all") q = q.eq("status", statusFilter);

      const ascending = sortBy === "oldest";
      const orderCol = sortBy === "continuity" ? "continuity_score" : "created_at";

      const { data, error } = await q
        .order(orderCol, { ascending, nullsFirst: false })
        .range(0, page * PAGE_SIZE - 1);

      if (error) throw error;
      return (data || []) as unknown as StoryJob[];
    },
  });

  const filtered = useMemo(() => {
    if (!stories) return [];
    if (!search.trim()) return stories;
    const qStr = search.toLowerCase();
    return stories.filter(
      (s) =>
        (s.title?.toLowerCase().includes(qStr) ?? false) ||
        (s.account_id?.toLowerCase().includes(qStr) ?? false) ||
        (s.story_type?.toLowerCase().includes(qStr) ?? false)
    );
  }, [stories, search]);

  const hasMore = (stories?.length ?? 0) >= page * PAGE_SIZE;

  const doneCount = stories?.filter((s) => s.status === "done").length ?? 0;
  const failedCount = stories?.filter((s) => s.status === "failed").length ?? 0;
  const activeCount =
    stories?.filter((s) => ["draft", "generating", "partial"].includes(s.status)).length ?? 0;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "done":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "partial":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "draft":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "generating":
        return "bg-primary/20 text-primary border-primary/30";
      case "failed":
        return "bg-destructive/20 text-destructive border-destructive/30";
      default:
        return "bg-secondary text-secondary-foreground";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <GlobalNav />

      <div className="border-b bg-background/95 backdrop-blur sticky top-14 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-semibold flex items-center gap-2">
                <Layers className="h-6 w-6 text-primary" />
                Story Library
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {stories?.length ?? 0} loaded · {doneCount} done · {activeCount} in progress ·{" "}
                {failedCount} failed
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search title, account, type..."
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
              {statusFilter !== "all" && (
                <Badge variant="secondary" className="h-5 text-[10px]">
                  1
                </Badge>
              )}
            </Button>
          </div>

          {showFilters && (
            <div className="mt-3 p-3 border rounded-lg bg-muted/30 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-muted-foreground uppercase">Status</span>
                {STATUSES.map((s) => (
                  <Button
                    key={s}
                    variant={statusFilter === s ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs capitalize"
                    onClick={() => {
                      setStatusFilter(s);
                      setPage(1);
                    }}
                  >
                    {s}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-muted-foreground uppercase">Sort</span>
                {(["newest", "oldest", "continuity"] as const).map((s) => (
                  <Button
                    key={s}
                    variant={sortBy === s ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs capitalize"
                    onClick={() => {
                      setSortBy(s);
                      setPage(1);
                    }}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {queryError ? (
          <div className="text-center py-20">
            <AlertTriangle className="h-12 w-12 text-destructive/60 mx-auto mb-4" />
            <p className="text-destructive font-medium">Failed to load stories</p>
            <p className="text-sm text-muted-foreground mt-1">{(queryError as Error).message}</p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Layers className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">No stories match your filters</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((story) => {
                const isDone = story.status === "done";
                const isFailed = story.status === "failed";
                const progress =
                  story.total_clips && story.completed_clips != null
                    ? Math.round((story.completed_clips / story.total_clips) * 100)
                    : null;

                return (
                  <button
                    key={story.id}
                    onClick={() => setPreview(story)}
                    className={cn(
                      "text-left p-4 rounded-lg border bg-card hover:bg-muted/50",
                      "hover:ring-2 hover:ring-primary/30 transition-all"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-medium text-sm line-clamp-2 flex-1">
                        {story.title || "Untitled story"}
                      </h3>
                      <Badge className={cn("text-[10px] uppercase shrink-0", statusBadge(story.status))}>
                        {story.status}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                      {story.account_id && (
                        <span className="truncate max-w-[120px]">{story.account_id}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(story.created_at)}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      {story.total_clips != null && (
                        <span className="text-muted-foreground">
                          {story.completed_clips ?? 0}/{story.total_clips} clips
                          {progress != null && ` · ${progress}%`}
                        </span>
                      )}
                      {story.continuity_score != null && (
                        <span className="text-muted-foreground">
                          Continuity: {story.continuity_score}
                        </span>
                      )}
                      {isDone && story.assembled_video_url && (
                        <span className="flex items-center gap-1 text-green-400 ml-auto">
                          <Play className="h-3 w-3" />
                          Playable
                        </span>
                      )}
                      {isFailed && (
                        <span className="flex items-center gap-1 text-destructive ml-auto">
                          <XCircle className="h-3 w-3" />
                          Failed
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {hasMore && (
              <div className="flex justify-center mt-8">
                <Button variant="outline" onClick={() => setPage((p) => p + 1)}>
                  Load more
                </Button>
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-4 text-center">
              Showing {filtered.length} stories
            </p>
          </>
        )}
      </div>

      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {preview?.title || "Untitled story"}
              {preview && (
                <Badge className={cn("text-[10px] uppercase", statusBadge(preview.status))}>
                  {preview.status}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {preview && (
            <div className="space-y-4">
              {preview.assembled_video_url ? (
                <video
                  src={preview.assembled_video_url}
                  controls
                  autoPlay
                  className="w-full rounded-lg bg-black"
                  style={{ maxHeight: "60vh" }}
                />
              ) : (
                <div className="aspect-video flex items-center justify-center bg-muted/30 rounded-lg">
                  <div className="text-center text-muted-foreground">
                    <Film className="h-10 w-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No assembled video yet</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Account</p>
                  <p className="font-medium">{preview.account_id || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p className="font-medium">{preview.story_type || preview.content_type || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Clips</p>
                  <p className="font-medium">
                    {preview.completed_clips ?? 0} / {preview.total_clips ?? 0}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Continuity</p>
                  <p className="font-medium">{preview.continuity_score ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="font-medium">{formatDate(preview.created_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Review</p>
                  <p className="font-medium">{preview.review_status || "—"}</p>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                {preview.assembled_video_url && (
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                  >
                    <a href={preview.assembled_video_url} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Open video
                    </a>
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => {
                    setPreview(null);
                    navigate("/studio");
                  }}
                >
                  Open in Studio
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
