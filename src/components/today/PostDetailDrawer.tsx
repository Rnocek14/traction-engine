import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Video, FileText, Loader2, CheckCircle, XCircle, AlertCircle, Image } from "lucide-react";
import { cn } from "@/lib/utils";

interface PostDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storyJobId: string | null;
  ideaId?: string | null;
}

export function PostDetailDrawer({ open, onOpenChange, storyJobId, ideaId }: PostDetailDrawerProps) {
  // Fetch story job details (storyboard, status)
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

  // Fetch video_jobs for this story
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

  // Fetch idea details if no job yet
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

  // Group clips by scene_id or sequence_index
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

            {/* Idea-only view (no story job yet) */}
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
              <div className="rounded-lg overflow-hidden bg-black">
                <video
                  src={storyJob.assembled_video_url}
                  controls
                  playsInline
                  className="w-full max-h-[300px] object-contain"
                />
                <p className="text-[10px] text-muted-foreground px-2 py-1">Assembled output</p>
              </div>
            )}

            {/* Scene-by-scene breakdown */}
            {scenes.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Storyboard — {scenes.length} scenes
                </h3>

                {scenes.map((scene: any, idx: number) => {
                  const sceneClips = clipsByScene.get(scene.id) || clipsByScene.get(`idx-${idx}`) || [];
                  const primaryClip = sceneClips.find((c: any) => c.is_primary) || sceneClips[0];

                  return (
                    <div key={scene.id || idx} className="bg-muted/30 border rounded-lg overflow-hidden">
                      {/* Scene header */}
                      <div className="p-3 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            Scene {idx + 1}
                          </Badge>
                          {scene.camera_direction && (
                            <span className="text-[10px] text-muted-foreground truncate">
                              📹 {scene.camera_direction}
                            </span>
                          )}
                          {scene.duration_target && (
                            <span className="text-[10px] text-muted-foreground ml-auto">
                              {scene.duration_target}s
                            </span>
                          )}
                        </div>

                        {/* Scene prompt — the key thing the user wants to see */}
                        <p className="text-xs leading-relaxed">{scene.prompt}</p>
                      </div>

                      {/* Clips for this scene */}
                      {sceneClips.length > 0 && (
                        <div className="border-t bg-background/50">
                          {sceneClips.map((clip: any) => (
                            <div key={clip.id} className="p-2 flex gap-2 items-start border-b last:border-b-0">
                              {/* Thumbnail or video */}
                              <div className="w-20 h-14 rounded bg-black shrink-0 overflow-hidden relative">
                                {clip.thumbnail_url ? (
                                  <img src={clip.thumbnail_url} alt="" className="w-full h-full object-cover" />
                                ) : clip.output_url ? (
                                  <video src={clip.output_url} className="w-full h-full object-cover" muted playsInline />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Image className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                )}
                                {clip.is_primary && (
                                  <Badge className="absolute top-0.5 left-0.5 text-[8px] h-3.5 px-1 bg-primary/80">
                                    Primary
                                  </Badge>
                                )}
                              </div>

                              {/* Clip details */}
                              <div className="flex-1 min-w-0 space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  {getClipStatusIcon(clip.status)}
                                  <Badge variant="outline" className="text-[10px] h-4">
                                    {clip.provider}
                                  </Badge>
                                  {clip.auto_overall_score != null && (
                                    <span className="text-[10px] text-muted-foreground ml-auto">
                                      Q:{clip.auto_overall_score}
                                    </span>
                                  )}
                                </div>

                                {/* Show enriched prompt if different from original */}
                                {clip.enriched_prompt && clip.enriched_prompt !== clip.original_prompt ? (
                                  <details className="text-[10px]">
                                    <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
                                      Enriched prompt
                                    </summary>
                                    <p className="mt-1 text-muted-foreground leading-relaxed whitespace-pre-wrap">
                                      {clip.enriched_prompt}
                                    </p>
                                  </details>
                                ) : clip.original_prompt ? (
                                  <p className="text-[10px] text-muted-foreground line-clamp-2">{clip.original_prompt}</p>
                                ) : null}

                                {clip.error && (
                                  <p className="text-[10px] text-destructive">{clip.error}</p>
                                )}
                              </div>
                            </div>
                          ))}
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
                  <div key={clip.id} className="bg-muted/30 border rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-1.5">
                      {getClipStatusIcon(clip.status)}
                      <Badge variant="outline" className="text-[10px]">{clip.provider}</Badge>
                      {clip.auto_overall_score != null && (
                        <span className="text-[10px] text-muted-foreground ml-auto">Score: {clip.auto_overall_score}</span>
                      )}
                    </div>
                    {clip.original_prompt && (
                      <p className="text-xs text-muted-foreground">{clip.original_prompt}</p>
                    )}
                    {clip.enriched_prompt && clip.enriched_prompt !== clip.original_prompt && (
                      <details className="text-[10px]">
                        <summary className="text-muted-foreground cursor-pointer">Enriched prompt</summary>
                        <p className="mt-1 text-muted-foreground whitespace-pre-wrap">{clip.enriched_prompt}</p>
                      </details>
                    )}
                    {clip.output_url && (
                      <video src={clip.output_url} controls playsInline className="w-full rounded max-h-[200px] object-contain bg-black" />
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
