import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Video, FileText, Loader2, CheckCircle, XCircle, AlertCircle, Image, Play, Pause, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Scene Video Player ─────────────────────────────────────

function SceneVideoPlayer({ url, poster }: { url: string; poster?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => setFailed(true));
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }, []);

  if (failed) {
    return (
      <div className="w-full aspect-video bg-secondary/30 rounded-md flex flex-col items-center justify-center gap-1.5">
        <p className="text-[10px] text-muted-foreground">Preview unavailable</p>
        <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => window.open(url, "_blank")}>
          Open in new tab
        </Button>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video bg-black rounded-md overflow-hidden group">
      <video
        ref={videoRef}
        src={url}
        poster={poster}
        muted={muted}
        playsInline
        loop
        className="w-full h-full object-contain"
        onError={() => setFailed(true)}
        onEnded={() => setPlaying(false)}
      />
      {/* Play/pause overlay */}
      <div
        className="absolute inset-0 flex items-center justify-center cursor-pointer bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={togglePlay}
      >
        {playing ? (
          <Pause className="h-8 w-8 text-white drop-shadow-lg" />
        ) : (
          <Play className="h-8 w-8 text-white drop-shadow-lg" />
        )}
      </div>
      {/* Mute toggle */}
      <button
        className="absolute bottom-1.5 right-1.5 h-6 w-6 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => { e.stopPropagation(); setMuted(!muted); if (videoRef.current) videoRef.current.muted = !muted; }}
      >
        {muted ? <VolumeX className="h-3 w-3 text-white" /> : <Volume2 className="h-3 w-3 text-white" />}
      </button>
      {/* Click to play when not playing */}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center cursor-pointer" onClick={togglePlay}>
          <div className="h-10 w-10 rounded-full bg-primary/90 flex items-center justify-center shadow-lg">
            <Play className="h-5 w-5 text-primary-foreground ml-0.5" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PostDetailDrawer ───────────────────────────────────────

interface PostDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storyJobId: string | null;
  ideaId?: string | null;
}

export function PostDetailDrawer({ open, onOpenChange, storyJobId, ideaId }: PostDetailDrawerProps) {
  const { data: storyJob, isLoading: jobLoading } = useQuery({
    queryKey: ["post-detail-job", storyJobId],
    queryFn: async () => {
      if (!storyJobId) return null;
      const { data, error } = await supabase
        .from("story_jobs")
        .select("id, title, status, story_type, storyboard_json, continuity_anchors, total_clips, completed_clips, assembled_video_url, review_status, created_at")
        .eq("id", storyJobId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open && !!storyJobId,
  });

  const { data: videoJobs, isLoading: clipsLoading } = useQuery({
    queryKey: ["post-detail-clips", storyJobId],
    queryFn: async () => {
      if (!storyJobId) return [];
      const { data, error } = await supabase
        .from("video_jobs")
        .select("id, sequence_index, scene_id, status, provider, original_prompt, enriched_prompt, output_url, thumbnail_url, is_primary, auto_overall_score, auto_match_score, auto_quality_score, error")
        .eq("story_job_id", storyJobId)
        .order("sequence_index", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!storyJobId,
  });

  const { data: idea } = useQuery({
    queryKey: ["post-detail-idea", ideaId],
    queryFn: async () => {
      if (!ideaId) return null;
      const { data, error } = await supabase
        .from("content_ideas")
        .select("id, title, subject, angle, content_type, reasoning, emotional_triggers, suggested_hook_type, opportunity_score")
        .eq("id", ideaId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open && !!ideaId && !storyJobId,
  });

  const scenes = (storyJob?.storyboard_json as any)?.scenes || [];
  const isLoading = jobLoading || clipsLoading;

  const clipsByScene = new Map<string, typeof videoJobs>();
  for (const clip of videoJobs || []) {
    const key = clip.scene_id || `idx-${clip.sequence_index}`;
    const arr = clipsByScene.get(key) || [];
    arr.push(clip);
    clipsByScene.set(key, arr);
  }

  const getClipStatusIcon = (status: string) => {
    switch (status) {
      case "done": return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
      case "failed": return <XCircle className="h-3.5 w-3.5 text-destructive" />;
      case "pending": case "generating": return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
      default: return <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="p-4 pb-2">
          <SheetTitle className="text-base truncate">
            {storyJob?.title || idea?.title || "Post Details"}
          </SheetTitle>
          {storyJob && (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-[10px]">{storyJob.story_type}</Badge>
              <Badge variant="outline" className="text-[10px]">{storyJob.status}</Badge>
              {storyJob.review_status && (
                <Badge variant="outline" className="text-[10px]">{storyJob.review_status}</Badge>
              )}
              <span className="text-[10px] text-muted-foreground ml-auto">
                {storyJob.completed_clips}/{storyJob.total_clips} clips
              </span>
            </div>
          )}
        </SheetHeader>

        <Separator />

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-4">
            {isLoading && (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-lg" />
                ))}
              </div>
            )}

            {/* Idea-only view */}
            {!storyJobId && idea && (
              <div className="space-y-3">
                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                  <p className="text-sm font-medium">{idea.title}</p>
                  {idea.subject && <p className="text-xs text-muted-foreground">Subject: {idea.subject}</p>}
                  {idea.angle && <p className="text-xs text-muted-foreground">Angle: {idea.angle}</p>}
                  {idea.reasoning && (
                    <>
                      <Separator className="my-2" />
                      <p className="text-xs text-muted-foreground">{idea.reasoning}</p>
                    </>
                  )}
                  {idea.emotional_triggers?.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {idea.emotional_triggers.map((t: string) => (
                        <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                      ))}
                    </div>
                  )}
                  {idea.opportunity_score && (
                    <p className="text-[10px] text-muted-foreground">Opportunity: {idea.opportunity_score}/100</p>
                  )}
                </div>
              </div>
            )}

            {/* Assembled video preview */}
            {storyJob?.assembled_video_url && (
              <div className="space-y-1.5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Video className="h-3.5 w-3.5" />
                  Final Assembled Video
                </h3>
                <SceneVideoPlayer url={storyJob.assembled_video_url} />
              </div>
            )}

            {/* Scene-by-scene breakdown with playable clips */}
            {scenes.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Scenes — {scenes.length} total
                </h3>

                {scenes.map((scene: any, idx: number) => {
                  const sceneClips = clipsByScene.get(scene.id) || clipsByScene.get(`idx-${idx}`) || [];
                  const primaryClip = sceneClips.find((c: any) => c.is_primary) || sceneClips.find((c: any) => c.status === "done" && c.output_url) || sceneClips[0];
                  const hasPlayableClip = primaryClip?.output_url && primaryClip.status === "done";

                  return (
                    <div key={scene.id || idx} className="bg-muted/30 border rounded-lg overflow-hidden">
                      {/* Scene header */}
                      <div className="p-3 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            Scene {idx + 1}
                          </Badge>
                          {scene.beat_role && (
                            <Badge variant="secondary" className="text-[10px]">{scene.beat_role}</Badge>
                          )}
                          {scene.duration_target && (
                            <span className="text-[10px] text-muted-foreground ml-auto">
                              {scene.duration_target}s
                            </span>
                          )}
                        </div>

                        {/* Narration line */}
                        {scene.narration_line && (
                          <p className="text-xs leading-relaxed italic text-muted-foreground">
                            🎙 "{scene.narration_line}"
                          </p>
                        )}

                        {/* Text overlay */}
                        {scene.onscreen_text && (
                          <p className="text-[10px] text-muted-foreground">
                            📝 Overlay: <span className="font-medium text-foreground">{scene.onscreen_text}</span>
                          </p>
                        )}
                      </div>

                      {/* Playable video for the primary/best clip */}
                      {hasPlayableClip && (
                        <div className="px-3 pb-2">
                          <SceneVideoPlayer
                            url={primaryClip.output_url!}
                            poster={primaryClip.thumbnail_url || undefined}
                          />
                          <div className="flex items-center gap-1.5 mt-1.5">
                            {getClipStatusIcon(primaryClip.status)}
                            <Badge variant="outline" className="text-[10px] h-4">{primaryClip.provider}</Badge>
                            {primaryClip.is_primary && (
                              <Badge className="text-[10px] h-4 bg-primary/80">Primary</Badge>
                            )}
                            {primaryClip.auto_overall_score != null && (
                              <span className="text-[10px] text-muted-foreground ml-auto">
                                Quality: {primaryClip.auto_overall_score}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Other clips (if multiple generated) */}
                      {sceneClips.length > 1 && (
                        <details className="border-t">
                          <summary className="p-2 text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                            {sceneClips.length - 1} other clip{sceneClips.length > 2 ? "s" : ""} generated
                          </summary>
                          <div className="px-2 pb-2 space-y-2">
                            {sceneClips.filter((c: any) => c.id !== primaryClip?.id).map((clip: any) => (
                              <div key={clip.id} className="space-y-1">
                                {clip.output_url && clip.status === "done" && (
                                  <SceneVideoPlayer url={clip.output_url} poster={clip.thumbnail_url || undefined} />
                                )}
                                <div className="flex items-center gap-1.5">
                                  {getClipStatusIcon(clip.status)}
                                  <Badge variant="outline" className="text-[10px] h-4">{clip.provider}</Badge>
                                  {clip.auto_overall_score != null && (
                                    <span className="text-[10px] text-muted-foreground ml-auto">Q:{clip.auto_overall_score}</span>
                                  )}
                                </div>
                                {clip.error && <p className="text-[10px] text-destructive">{clip.error}</p>}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}

                      {/* Single non-playable clip info */}
                      {sceneClips.length === 1 && !hasPlayableClip && (
                        <div className="border-t p-2 flex items-center gap-1.5">
                          {getClipStatusIcon(sceneClips[0].status)}
                          <Badge variant="outline" className="text-[10px] h-4">{sceneClips[0].provider}</Badge>
                          <span className="text-[10px] text-muted-foreground">{sceneClips[0].status}</span>
                          {sceneClips[0].error && (
                            <span className="text-[10px] text-destructive truncate ml-auto">{sceneClips[0].error}</span>
                          )}
                        </div>
                      )}

                      {/* No clips yet */}
                      {sceneClips.length === 0 && (
                        <div className="border-t p-2 text-center">
                          <p className="text-[10px] text-muted-foreground">No clips generated yet</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Standalone clips not tied to scenes */}
            {(videoJobs || []).length > 0 && scenes.length === 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Video className="h-3.5 w-3.5" />
                  Clips — {videoJobs!.length}
                </h3>
                {videoJobs!.map((clip: any) => (
                  <div key={clip.id} className="bg-muted/30 border rounded-lg overflow-hidden space-y-2">
                    <div className="p-3 flex items-center gap-1.5">
                      {getClipStatusIcon(clip.status)}
                      <Badge variant="outline" className="text-[10px]">{clip.provider}</Badge>
                      {clip.auto_overall_score != null && (
                        <span className="text-[10px] text-muted-foreground ml-auto">Score: {clip.auto_overall_score}</span>
                      )}
                    </div>
                    {clip.original_prompt && (
                      <p className="text-xs text-muted-foreground px-3">{clip.original_prompt}</p>
                    )}
                    {clip.output_url && clip.status === "done" && (
                      <div className="px-3 pb-3">
                        <SceneVideoPlayer url={clip.output_url} poster={clip.thumbnail_url || undefined} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
