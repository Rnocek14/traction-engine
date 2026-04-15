import { useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "@/hooks/use-toast";
import {
  Video, FileText, Loader2, CheckCircle, XCircle, AlertCircle,
  Play, Pause, Volume2, VolumeX, Zap, Mic, Sparkles, Eye,
  Clock, Camera, MessageSquareQuote, Target, Lightbulb, Download,
} from "lucide-react";
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
      <div
        className="absolute inset-0 flex items-center justify-center cursor-pointer bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={togglePlay}
      >
        {playing ? <Pause className="h-8 w-8 text-white drop-shadow-lg" /> : <Play className="h-8 w-8 text-white drop-shadow-lg" />}
      </div>
      <button
        className="absolute bottom-1.5 right-1.5 h-6 w-6 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => { e.stopPropagation(); setMuted(!muted); if (videoRef.current) videoRef.current.muted = !muted; }}
      >
        {muted ? <VolumeX className="h-3 w-3 text-white" /> : <Volume2 className="h-3 w-3 text-white" />}
      </button>
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

// ─── Audio Player ───────────────────────────────────────────

function VoiceoverPlayer({ url, duration }: { url: string; duration?: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  return (
    <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-2">
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        onClick={() => {
          const a = audioRef.current;
          if (!a) return;
          if (a.paused) { a.play(); setPlaying(true); }
          else { a.pause(); setPlaying(false); }
        }}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </Button>
      <audio ref={audioRef} src={url} onEnded={() => setPlaying(false)} />
      <div className="flex-1">
        <div className="text-xs font-medium">Voiceover Audio</div>
        {duration && <span className="text-[10px] text-muted-foreground">{(duration / 1000).toFixed(1)}s</span>}
      </div>
      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => window.open(url, "_blank")}>
        <Download className="h-3 w-3" />
      </Button>
    </div>
  );
}

// ─── Status helpers ─────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  generating: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
  done: "bg-green-500/10 text-green-600 border-green-500/30",
  failed: "bg-destructive/10 text-destructive border-destructive/30",
  assembling: "bg-blue-500/10 text-blue-600 border-blue-500/30",
};

function getClipStatusIcon(status: string) {
  switch (status) {
    case "done": return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
    case "failed": return <XCircle className="h-3.5 w-3.5 text-destructive" />;
    case "pending": case "generating": case "running": case "queued":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
    default: return <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

// ─── PostDetailDrawer ───────────────────────────────────────

interface PostDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storyJobId: string | null;
  ideaId?: string | null;
}

export function PostDetailDrawer({ open, onOpenChange, storyJobId, ideaId }: PostDetailDrawerProps) {
  const queryClient = useQueryClient();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ─── Data fetching ──────────────────────────────────────
  const { data: storyJob, isLoading: jobLoading } = useQuery({
    queryKey: ["post-detail-job", storyJobId],
    queryFn: async () => {
      if (!storyJobId) return null;
      const { data, error } = await supabase
        .from("story_jobs")
        .select("id, title, status, story_type, storyboard_json, continuity_anchors, total_clips, completed_clips, assembled_video_url, review_status, created_at, account_id, content_type")
        .eq("id", storyJobId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open && !!storyJobId,
    refetchInterval: open && storyJobId ? 5000 : false,
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
    refetchInterval: open && storyJobId ? 5000 : false,
  });

  const { data: voiceover } = useQuery({
    queryKey: ["post-detail-voiceover", storyJobId],
    queryFn: async () => {
      if (!storyJobId) return null;
      const { data, error } = await supabase
        .from("story_voiceovers")
        .select("id, status, audio_url, compiled_script, raw_narration, total_duration_ms, voice_name, error, is_active")
        .eq("story_job_id", storyJobId)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open && !!storyJobId,
    refetchInterval: open && storyJobId ? 5000 : false,
  });

  const { data: accountConfig } = useQuery({
    queryKey: ["post-detail-account", storyJob?.account_id],
    queryFn: async () => {
      if (!storyJob?.account_id) return null;
      const { data, error } = await supabase
        .from("account_configs")
        .select("account_name, vertical, visual_style, hook_style, voice_id, voice_provider, realism_level, style_notes")
        .eq("account_id", storyJob.account_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open && !!storyJob?.account_id,
  });

  const { data: idea } = useQuery({
    queryKey: ["post-detail-idea", ideaId],
    queryFn: async () => {
      if (!ideaId) return null;
      const { data, error } = await supabase
        .from("content_ideas")
        .select("id, title, subject, angle, content_type, reasoning, emotional_triggers, suggested_hook_type, opportunity_score, content_category")
        .eq("id", ideaId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open && !!ideaId,
  });

  // ─── Derived data ────────────────────────────────────────
  const scenes = (storyJob?.storyboard_json as any)?.scenes || [];
  const isLoading = jobLoading || clipsLoading;
  const hasNarration = scenes.some((s: any) => s.narration_line);
  const totalDuration = scenes.reduce((sum: number, s: any) => sum + (s.duration_target || 5), 0);
  const fullScript = scenes.map((s: any) => s.narration_line).filter(Boolean).join("\n\n");

  const clipsByScene = new Map<string, typeof videoJobs>();
  for (const clip of videoJobs || []) {
    const key = clip.scene_id || `idx-${clip.sequence_index}`;
    const arr = clipsByScene.get(key) || [];
    arr.push(clip);
    clipsByScene.set(key, arr);
  }

  const clipsDone = (videoJobs || []).filter((c: any) => c.status === "done").length;
  const clipsTotal = (videoJobs || []).length;
  const allClipsDone = clipsTotal > 0 && clipsDone === clipsTotal;
  const hasVoiceover = voiceover?.status === "done" && voiceover?.audio_url;
  const canProduce = storyJob && scenes.length > 0 && (storyJob.status === "draft" || storyJob.status === "generating");
  const isFullyAssembled = !!storyJob?.assembled_video_url;

  // ─── Pipeline progress ───────────────────────────────────
  const pipelineSteps = [
    { label: "Storyboard", done: scenes.length > 0, active: false },
    { label: "Narration", done: hasNarration, active: false },
    { label: "Clips", done: allClipsDone, active: clipsTotal > 0 && !allClipsDone, detail: clipsTotal > 0 ? `${clipsDone}/${clipsTotal}` : undefined },
    { label: "Voiceover", done: !!hasVoiceover, active: voiceover?.status === "generating" || voiceover?.status === "pending" },
    { label: "Assembly", done: isFullyAssembled, active: storyJob?.status === "assembling" },
  ];

  // ─── Actions ─────────────────────────────────────────────
  const handleProduceAll = async () => {
    if (!storyJob) return;
    setActionLoading("produce");
    try {
      // 1. Generate clips (triggers scene 1, cron chains the rest)
      const { error: clipErr } = await supabase.functions.invoke("generate-story-chained", {
        body: {
          story_job_id: storyJob.id,
          scenes,
          anchors: storyJob.continuity_anchors || {},
          settings: { size: "720x1280" },
        },
      });
      if (clipErr) throw clipErr;

      // 2. Generate voiceover in parallel (compile script → generate audio)
      if (hasNarration) {
        const { data: compileResult, error: compileErr } = await supabase.functions.invoke("compile-story-script", {
          body: { story_job_id: storyJob.id },
        });
        if (!compileErr && compileResult?.voiceover_id) {
          await supabase.functions.invoke("generate-story-voiceover", {
            body: { voiceover_id: compileResult.voiceover_id },
          });
        }
      }

      toast({ title: "Production started!", description: "Clips + voiceover generating. Assembly auto-triggers when both finish." });
      queryClient.invalidateQueries({ queryKey: ["post-detail-job", storyJobId] });
      queryClient.invalidateQueries({ queryKey: ["post-detail-clips", storyJobId] });
      queryClient.invalidateQueries({ queryKey: ["post-detail-voiceover", storyJobId] });
      queryClient.invalidateQueries({ queryKey: ["today-feed"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col">
        {/* ─── Header ──────────────────────────────────────── */}
        <SheetHeader className="p-4 pb-3 space-y-3">
          <SheetTitle className="text-base leading-snug">
            {storyJob?.title || idea?.title || "Post Details"}
          </SheetTitle>

          {/* Account & metadata row */}
          {(storyJob || idea) && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {accountConfig?.account_name && (
                <Badge variant="outline" className="text-[10px]">@{accountConfig.account_name}</Badge>
              )}
              {accountConfig?.vertical && (
                <Badge variant="secondary" className="text-[10px]">{accountConfig.vertical}</Badge>
              )}
              {storyJob?.story_type && (
                <Badge variant="outline" className="text-[10px]">{storyJob.story_type}</Badge>
              )}
              {storyJob?.content_type && (
                <Badge variant="outline" className="text-[10px] capitalize">{storyJob.content_type}</Badge>
              )}
              {storyJob && (
                <Badge className={cn("text-[10px]", STATUS_COLORS[storyJob.status] || "")}>{storyJob.status}</Badge>
              )}
            </div>
          )}

          {/* Pipeline progress bar */}
          {storyJob && (
            <div className="flex items-center gap-1">
              {pipelineSteps.map((step, i) => (
                <div key={step.label} className="flex items-center gap-1 flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div className={cn(
                      "h-1.5 w-full rounded-full transition-colors",
                      step.done ? "bg-green-500" : step.active ? "bg-yellow-500 animate-pulse" : "bg-muted"
                    )} />
                    <span className="text-[9px] text-muted-foreground mt-0.5">
                      {step.label}{step.detail ? ` (${step.detail})` : ""}
                    </span>
                  </div>
                  {i < pipelineSteps.length - 1 && <div className="w-0.5" />}
                </div>
              ))}
            </div>
          )}
        </SheetHeader>

        {/* ─── Main Action Button ─────────────────────────── */}
        {canProduce && (
          <div className="px-4 pb-3">
            <Button
              className="w-full gap-2"
              size="lg"
              disabled={!!actionLoading || !scenes.length}
              onClick={handleProduceAll}
            >
              {actionLoading === "produce" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Produce All — {scenes.length} Scenes{hasNarration ? " + Voiceover" : ""}
            </Button>
            {!hasNarration && scenes.length > 0 && (
              <p className="text-[10px] text-yellow-600 mt-1 text-center">
                ⚠ No narration lines found — voiceover will be skipped
              </p>
            )}
          </div>
        )}

        <Separator />

        {/* ─── Content ────────────────────────────────────── */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-4">
            {isLoading && (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-lg" />
                ))}
              </div>
            )}

            {/* ── Final Assembled Video ──────────────────── */}
            {isFullyAssembled && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Video className="h-3.5 w-3.5" />
                  Final Video
                </h3>
                <SceneVideoPlayer url={storyJob!.assembled_video_url!} />
              </div>
            )}

            {/* ── Idea Context ───────────────────────────── */}
            {idea && (
              <div className="bg-primary/5 border border-primary/10 rounded-lg p-3 space-y-2">
                <h3 className="text-xs font-semibold flex items-center gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5 text-primary" />
                  Content Idea
                </h3>
                <p className="text-sm font-medium">{idea.title}</p>
                {idea.subject && (
                  <p className="text-xs text-muted-foreground"><strong>Subject:</strong> {idea.subject}</p>
                )}
                {idea.angle && (
                  <p className="text-xs text-muted-foreground"><strong>Angle:</strong> {idea.angle}</p>
                )}
                {idea.content_category && (
                  <p className="text-xs text-muted-foreground"><strong>Category:</strong> {idea.content_category}</p>
                )}
                {idea.reasoning && (
                  <p className="text-xs text-muted-foreground mt-1 italic">{idea.reasoning}</p>
                )}
                <div className="flex flex-wrap gap-1 pt-1">
                  {idea.suggested_hook_type && (
                    <Badge variant="secondary" className="text-[10px]">Hook: {idea.suggested_hook_type}</Badge>
                  )}
                  {idea.content_type && (
                    <Badge variant="outline" className="text-[10px] capitalize">{idea.content_type}</Badge>
                  )}
                  {idea.opportunity_score && (
                    <Badge variant="outline" className="text-[10px]">Score: {idea.opportunity_score}</Badge>
                  )}
                  {(idea.emotional_triggers || []).map((t: string) => (
                    <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* ── Voiceover Status ───────────────────────── */}
            {voiceover && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Mic className="h-3.5 w-3.5" />
                  Voiceover
                  <Badge variant="outline" className="text-[10px] ml-auto">{voiceover.status}</Badge>
                </h3>
                {voiceover.audio_url && (
                  <VoiceoverPlayer url={voiceover.audio_url} duration={voiceover.total_duration_ms || undefined} />
                )}
                {voiceover.voice_name && (
                  <p className="text-[10px] text-muted-foreground">Voice: {voiceover.voice_name}</p>
                )}
                {voiceover.error && (
                  <p className="text-[10px] text-destructive">{voiceover.error}</p>
                )}
              </div>
            )}

            {/* ── Full Script ────────────────────────────── */}
            {fullScript && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquareQuote className="h-3.5 w-3.5" />
                  Full Narration Script
                </h3>
                <div className="bg-muted/40 border rounded-lg p-3">
                  <p className="text-xs leading-relaxed whitespace-pre-line">{fullScript}</p>
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">
                      ~{totalDuration}s total · {scenes.length} scenes · ~{Math.ceil(fullScript.split(/\s+/).length / 2.5)}s narration
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Account Style ──────────────────────────── */}
            {accountConfig && (
              <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                <h3 className="text-xs font-semibold flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5 text-muted-foreground" />
                  Style Config
                </h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span>Visual: <strong className="text-foreground">{accountConfig.visual_style}</strong></span>
                  <span>Hook: <strong className="text-foreground">{accountConfig.hook_style}</strong></span>
                  <span>Realism: <strong className="text-foreground">{accountConfig.realism_level}%</strong></span>
                  {accountConfig.style_notes && (
                    <span className="col-span-2">Notes: {accountConfig.style_notes}</span>
                  )}
                </div>
              </div>
            )}

            {/* ── Scene Breakdown ────────────────────────── */}
            {scenes.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" />
                  Scenes — {scenes.length} total · ~{totalDuration}s
                </h3>

                <Accordion type="multiple" defaultValue={scenes.map((_: any, i: number) => `scene-${i}`)}>
                  {scenes.map((scene: any, idx: number) => {
                    const sceneClips = clipsByScene.get(scene.id) || clipsByScene.get(`idx-${idx}`) || [];
                    const primaryClip = sceneClips.find((c: any) => c.is_primary) || sceneClips.find((c: any) => c.status === "done" && c.output_url) || sceneClips[0];
                    const hasPlayableClip = primaryClip?.output_url && primaryClip.status === "done";

                    return (
                      <AccordionItem key={scene.id || idx} value={`scene-${idx}`} className="border bg-muted/20 rounded-lg mb-2 overflow-hidden">
                        <AccordionTrigger className="px-3 py-2 hover:no-underline">
                          <div className="flex items-center gap-2 flex-1 text-left">
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {idx + 1}
                            </Badge>
                            {scene.beat_role && (
                              <Badge variant="secondary" className="text-[10px]">{scene.beat_role}</Badge>
                            )}
                            {sceneClips.length > 0 && (
                              <span className="ml-auto mr-2">
                                {getClipStatusIcon(primaryClip?.status || "pending")}
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {scene.duration_target || 5}s
                            </span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-3 pb-3 space-y-2">
                          {/* Narration */}
                          {scene.narration_line && (
                            <div className="flex gap-1.5">
                              <Mic className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                              <p className="text-xs italic text-muted-foreground leading-relaxed">
                                "{scene.narration_line}"
                              </p>
                            </div>
                          )}

                          {/* Text overlay */}
                          {scene.onscreen_text && (
                            <div className="flex gap-1.5">
                              <FileText className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                              <p className="text-[11px] text-muted-foreground">
                                Overlay: <span className="font-medium text-foreground">{scene.onscreen_text}</span>
                              </p>
                            </div>
                          )}

                          {/* Visual prompt */}
                          {(scene.prompt || scene.visual_prompt) && (
                            <div className="flex gap-1.5">
                              <Camera className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                {scene.prompt || scene.visual_prompt}
                              </p>
                            </div>
                          )}

                          {/* Camera direction */}
                          {scene.camera_direction && (
                            <p className="text-[10px] text-muted-foreground pl-4">
                              📷 {scene.camera_direction}
                            </p>
                          )}

                          {/* Video clip */}
                          {hasPlayableClip && (
                            <div className="pt-1">
                              <SceneVideoPlayer
                                url={primaryClip.output_url!}
                                poster={primaryClip.thumbnail_url || undefined}
                              />
                              <div className="flex items-center gap-1.5 mt-1.5">
                                {getClipStatusIcon(primaryClip.status)}
                                <Badge variant="outline" className="text-[10px] h-4">{primaryClip.provider}</Badge>
                                {primaryClip.auto_overall_score != null && (
                                  <span className="text-[10px] text-muted-foreground ml-auto">
                                    Quality: {primaryClip.auto_overall_score}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Non-playable clip status */}
                          {sceneClips.length > 0 && !hasPlayableClip && (
                            <div className="flex items-center gap-1.5 pt-1">
                              {getClipStatusIcon(sceneClips[0].status)}
                              <Badge variant="outline" className="text-[10px] h-4">{sceneClips[0].provider}</Badge>
                              <span className="text-[10px] text-muted-foreground">{sceneClips[0].status}</span>
                              {sceneClips[0].error && (
                                <span className="text-[10px] text-destructive truncate ml-auto max-w-[150px]">{sceneClips[0].error}</span>
                              )}
                            </div>
                          )}

                          {/* No clips */}
                          {sceneClips.length === 0 && (
                            <p className="text-[10px] text-muted-foreground">No clip generated yet</p>
                          )}

                          {/* Extra clips */}
                          {sceneClips.length > 1 && (
                            <details className="pt-1">
                              <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                                {sceneClips.length - 1} alternate clip{sceneClips.length > 2 ? "s" : ""}
                              </summary>
                              <div className="mt-1 space-y-2">
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
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </div>
            )}

            {/* ── Idea-only (no story yet) ───────────────── */}
            {!storyJobId && idea && !storyJob && (
              <div className="text-center py-6 text-sm text-muted-foreground">
                Click <strong>Produce</strong> on the Today page to generate a storyboard from this idea.
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
