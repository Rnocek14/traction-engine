import { useViralVideos, ViralVideo } from "@/hooks/use-viral-videos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, TrendingUp, Loader2, Eye, Heart, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

function platformColor(p: string) {
  switch (p) {
    case "tiktok": return "bg-primary/10 text-primary";
    case "instagram": return "bg-pink-500/10 text-pink-500";
    case "youtube": return "bg-red-500/10 text-red-500";
    default: return "bg-muted text-muted-foreground";
  }
}

function formatCount(n: number | null): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function VideoCard({ video }: { video: ViralVideo }) {
  const navigate = useNavigate();

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className={`text-xs ${platformColor(video.platform)}`}>
            {video.platform}
          </Badge>
          {video.processing_status === "processing" && (
            <Badge variant="outline" className="text-xs gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Processing
            </Badge>
          )}
          {video.extracted_product_name && (
            <span className="text-xs font-medium text-foreground truncate">
              {video.extracted_product_name}
            </span>
          )}
        </div>

        {video.source_hook && (
          <p className="text-xs text-muted-foreground italic">Hook: "{video.source_hook}"</p>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {video.views != null && (
            <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{formatCount(video.views)}</span>
          )}
          {video.likes != null && (
            <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{formatCount(video.likes)}</span>
          )}
          {video.comments_count != null && (
            <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{formatCount(video.comments_count)}</span>
          )}
          <a href={video.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline ml-auto">
            <ExternalLink className="w-3 h-3" /> View
          </a>
        </div>

        {video.linked_product_id && (
          <button
            onClick={() => navigate(`/products/${video.linked_product_id}`)}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <TrendingUp className="w-3 h-3" /> View product dossier →
          </button>
        )}
      </div>
    </div>
  );
}

export function ViralVideoList({ productId }: { productId?: string }) {
  const { data: videos, isLoading } = useViralVideos(productId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Viral Videos</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </CardContent>
      </Card>
    );
  }

  if (!videos?.length) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Reference Creative</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No viral videos linked yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          Reference Creative
          <Badge variant="secondary" className="text-xs">{videos.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {videos.map((v) => <VideoCard key={v.id} video={v} />)}
      </CardContent>
    </Card>
  );
}
