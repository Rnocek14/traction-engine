import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, XCircle, RotateCcw, Play, Clock, Film, Flame } from "lucide-react";
import type { EnrichmentMeta } from "@/hooks/use-assembled-videos";

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
}

interface AssembledVideoCardProps {
  video: AssembledVideo;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onReassemble?: (id: string) => void;
}

export function AssembledVideoCard({ video, onApprove, onReject, onReassemble }: AssembledVideoCardProps) {
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
