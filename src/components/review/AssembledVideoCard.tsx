import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, XCircle, RotateCcw, Play, Clock, Film, Flame, Shield, Eye, Heart, Share2 } from "lucide-react";
import type { EnrichmentMeta, ConfidenceScore, PerformanceData } from "@/hooks/use-assembled-videos";
import { PerformanceIngestForm } from "./PerformanceIngestForm";

interface AssembledVideo {
  id: string;
  title: string | null;
  story_type: string;
  assembled_status: string;
  assembled_video_url: string | null;
  assembled_at: string | null;
  assembled_meta: unknown;
  total_clips: number | null;
  continuity_score: number | null;
  account_id: string;
  enrichment?: EnrichmentMeta;
  confidence?: ConfidenceScore;
  performance?: PerformanceData;
}

interface AssembledVideoCardProps {
  video: AssembledVideo;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onReassemble?: (id: string) => void;
  onRefresh?: () => void;
}

export function AssembledVideoCard({ video, onApprove, onReject, onReassemble, onRefresh }: AssembledVideoCardProps) {
  const [playing, setPlaying] = useState(false);
  const meta = (video.assembled_meta && typeof video.assembled_meta === 'object' && !Array.isArray(video.assembled_meta))
    ? video.assembled_meta as Record<string, unknown>
    : null;

  const statusColor = {
    succeeded: "text-success border-success/30 bg-success/10",
    rendering: "text-warning border-warning/30 bg-warning/10",
    failed: "text-destructive border-destructive/30 bg-destructive/10",
    queued: "text-primary border-primary/30 bg-primary/10",
  }[video.assembled_status] || "text-muted-foreground border-border";

  return (
    <Card className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm">
      <CardContent className="p-0">
        <div className="flex flex-col md:flex-row">
          {/* Video Preview */}
          <div className="relative w-full md:w-[200px] aspect-[9/16] md:aspect-auto md:h-[356px] bg-black flex-shrink-0">
            {video.assembled_video_url ? (
              playing ? (
                <video
                  src={video.assembled_video_url}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                  onEnded={() => setPlaying(false)}
                />
              ) : (
                <button
                  onClick={() => setPlaying(true)}
                  className="w-full h-full flex items-center justify-center group"
                >
                  <div className="w-14 h-14 rounded-full bg-primary/80 flex items-center justify-center group-hover:bg-primary transition-colors">
                    <Play className="w-6 h-6 text-primary-foreground ml-1" />
                  </div>
                </button>
              )
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <Film className="w-8 h-8 opacity-30" />
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex-1 p-5 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-lg leading-tight">
                  {video.title || "Untitled Story"}
                </h3>
                <Badge variant="outline" className={statusColor}>
                  {video.assembled_status}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Film className="w-3.5 h-3.5" />
                  {video.total_clips || 0} clips
                </span>
                {video.assembled_at && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {new Date(video.assembled_at).toLocaleDateString()}
                  </span>
                )}
                {video.continuity_score != null && (
                  <span>
                    Continuity: {Math.round(video.continuity_score * 100)}%
                  </span>
                )}
                <Badge variant="secondary" className="text-xs">
                  {video.story_type}
                </Badge>
                </div>

                {/* Enrichment metadata */}
                {video.enrichment?.used && (
                  <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                      <Flame className="w-3.5 h-3.5" />
                      Trend Enriched
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {video.enrichment.hooks.map((h, i) => (
                        <Badge key={`h-${i}`} variant="secondary" className="text-xs">
                          🪝 {h}
                        </Badge>
                      ))}
                      {video.enrichment.emotions.map((e, i) => (
                        <Badge key={`e-${i}`} variant="secondary" className="text-xs">
                          💡 {e}
                        </Badge>
                      ))}
                      {video.enrichment.format && (
                        <Badge variant="outline" className="text-xs">
                          📐 {video.enrichment.format}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Confidence Score */}
                {video.confidence && (
                  <div className="flex items-center gap-3 rounded-md border border-border/50 bg-secondary/30 px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <Shield className={`w-4 h-4 ${
                        video.confidence.level === "high" ? "text-success" :
                        video.confidence.level === "medium" ? "text-warning" : "text-destructive"
                      }`} />
                      <span className="font-semibold text-sm">
                        {video.confidence.overall.toFixed(1)}
                      </span>
                      <span className="text-xs text-muted-foreground">/ 10</span>
                    </div>
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <span>Quality {video.confidence.quality.toFixed(0)}</span>
                      <span>·</span>
                      <span>Continuity {video.confidence.continuity.toFixed(0)}</span>
                      <span>·</span>
                      <span>Completion {video.confidence.completion.toFixed(0)}</span>
                    </div>
                  </div>
                )}

                {/* Performance Metrics (if available) */}
                {video.performance && (
                  <div className="rounded-md border border-success/20 bg-success/5 p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-success">
                      <Eye className="w-3.5 h-3.5" />
                      Live Performance — Score: {video.performance.outcome_score ?? "—"}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {video.performance.views != null && (
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" /> {video.performance.views.toLocaleString()} views
                        </span>
                      )}
                      {video.performance.likes != null && (
                        <span className="flex items-center gap-1">
                          <Heart className="w-3 h-3" /> {video.performance.likes.toLocaleString()}
                        </span>
                      )}
                      {video.performance.shares != null && (
                        <span className="flex items-center gap-1">
                          <Share2 className="w-3 h-3" /> {video.performance.shares.toLocaleString()}
                        </span>
                      )}
                      {video.performance.watch_3s_rate != null && (
                        <span>3s: {video.performance.watch_3s_rate}%</span>
                      )}
                      {video.performance.avg_watch_time != null && (
                        <span>Avg: {video.performance.avg_watch_time}s</span>
                      )}
                      {video.performance.platform && (
                        <Badge variant="outline" className="text-xs capitalize">
                          {video.performance.platform}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>

            {/* Actions */}
            {video.assembled_status === "succeeded" && (
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/50">
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => onApprove?.(video.id)}
                >
                  <CheckCircle className="w-4 h-4" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-1.5"
                  onClick={() => onReject?.(video.id)}
                >
                  <XCircle className="w-4 h-4" />
                  Reject
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => onReassemble?.(video.id)}
                >
                  <RotateCcw className="w-4 h-4" />
                  Reassemble
                </Button>
                {video.assembled_video_url && (
                  <a
                    href={video.assembled_video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto"
                  >
                    <Button size="sm" variant="ghost">
                      Download
                    </Button>
                  </a>
                )}
              </div>
            )}

            {(video.assembled_status === "rendering" || video.assembled_status === "queued") && (
              <div className="mt-4 pt-4 border-t border-border/50 space-y-2">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 animate-spin" />
                    {video.assembled_status === "queued" ? "Queued…" : "Rendering…"}
                  </span>
                  <span className="font-mono text-xs">
                    {meta?.progress != null
                      ? `${Math.round(Number(meta.progress) * 100)}%`
                      : meta?.eta_seconds != null
                        ? `ETA ${meta.eta_seconds}s`
                        : "Starting…"}
                  </span>
                </div>
                {meta?.progress != null && (
                  <Progress value={Math.round(Number(meta.progress) * 100)} className="h-2" />
                )}
              </div>
            )}

            {video.assembled_status === "failed" && (
              <div className="mt-4 pt-4 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-destructive">
                    {meta?.error ? String(meta.error) : "Assembly failed"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => onReassemble?.(video.id)}
                  >
                    <RotateCcw className="w-4 h-4" />
                    Reassemble
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
