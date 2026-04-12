import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, RotateCcw, Play, Clock, Film } from "lucide-react";

interface AssembledVideo {
  id: string;
  title: string | null;
  story_type: string;
  assembled_status: string;
  assembled_video_url: string | null;
  assembled_at: string | null;
  total_clips: number | null;
  continuity_score: number | null;
  account_id: string;
}

interface AssembledVideoCardProps {
  video: AssembledVideo;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onReassemble?: (id: string) => void;
}

export function AssembledVideoCard({ video, onApprove, onReject, onReassemble }: AssembledVideoCardProps) {
  const [playing, setPlaying] = useState(false);

  const statusColor = {
    succeeded: "text-green-500 border-green-500/30 bg-green-500/10",
    rendering: "text-yellow-500 border-yellow-500/30 bg-yellow-500/10",
    failed: "text-red-500 border-red-500/30 bg-red-500/10",
    queued: "text-blue-500 border-blue-500/30 bg-blue-500/10",
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

            {video.assembled_status === "rendering" && (
              <div className="mt-4 pt-4 border-t border-border/50">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <RotateCcw className="w-4 h-4 animate-spin" />
                  Rendering in progress…
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
