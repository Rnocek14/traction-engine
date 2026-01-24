import { useState, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { 
  Video, Mic, Loader2, Play, Beaker, Link2, Moon, Sun, 
  Zap, Film, Camera, Sparkles, Ghost, Clapperboard
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  VideoEngine,
  VoiceEngine,
  VIDEO_ENGINES,
  VOICE_ENGINES,
  ENGINE_DURATIONS,
  getValidDuration,
  generateVideo,
  generateVoice,
} from "@/lib/lab-engines";
import { STYLE_PRESETS } from "@/data/style-presets";

// ============ QUICK PRESETS ============
const QUICK_STYLES = [
  { id: "dark", icon: Moon, label: "Dark/Horror", color: "bg-purple-500/20 text-purple-300 border-purple-500/30", 
    prompt: "Dark atmospheric scene, low-key lighting, deep shadows, dramatic contrast, cinematic horror feel" },
  { id: "bright", icon: Sun, label: "Bright/Happy", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    prompt: "Bright natural lighting, warm golden tones, inviting atmosphere, lifestyle aesthetic" },
  { id: "action", icon: Zap, label: "Action/Energy", color: "bg-red-500/20 text-red-300 border-red-500/30",
    prompt: "Dynamic motion, high energy, fast-paced movement, intense cinematic action" },
  { id: "cinematic", icon: Film, label: "Cinematic", color: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    prompt: "Cinematic wide shot, film grain, anamorphic lens flare, professional cinematography" },
  { id: "intimate", icon: Camera, label: "Close-up", color: "bg-pink-500/20 text-pink-300 border-pink-500/30",
    prompt: "Intimate close-up, shallow depth of field, beautiful bokeh, emotional detail" },
  { id: "dreamy", icon: Sparkles, label: "Dreamy", color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    prompt: "Ethereal atmosphere, soft diffused light, magical quality, dreamlike visuals" },
];

const PROMPT_TEMPLATES = [
  { id: "person", label: "👤 Person", template: "A person [action], wearing [clothing], in [location]. [mood] atmosphere." },
  { id: "nature", label: "🌿 Nature", template: "A [time_of_day] scene in [environment]. [weather], [lighting] light filtering through." },
  { id: "urban", label: "🏙️ Urban", template: "[City/street] at [time], [weather conditions]. [camera movement] following [subject]." },
  { id: "product", label: "📦 Product", template: "[Product] on [surface], [lighting setup], smooth [camera_motion] revealing details." },
  { id: "abstract", label: "🎨 Abstract", template: "[Colors/shapes] flowing and transforming, [texture] quality, [motion style] movement." },
  { id: "story", label: "📖 Story", template: "[Character] discovers [object/place], their expression shifts from [emotion1] to [emotion2]." },
];

// ElevenLabs voices
const ELEVENLABS_VOICES = [
  { id: "roger", name: "Roger", description: "Deep, authoritative" },
  { id: "sarah", name: "Sarah", description: "Warm, friendly" },
  { id: "charlie", name: "Charlie", description: "Young, energetic" },
  { id: "george", name: "George", description: "British, refined" },
  { id: "jessica", name: "Jessica", description: "Warm, conversational" },
  { id: "brian", name: "Brian", description: "Deep, dramatic" },
];

// OpenAI voices
const OPENAI_VOICES = [
  { id: "coral", name: "Coral", description: "Warm, conversational" },
  { id: "sage", name: "Sage", description: "Calm, measured" },
  { id: "ash", name: "Ash", description: "Clear, direct" },
  { id: "ballad", name: "Ballad", description: "Expressive, storytelling" },
];

export interface LabResult {
  id: string;
  type: "video" | "audio";
  engine: VideoEngine | VoiceEngine;
  status: "queued" | "running" | "done" | "failed";
  progress: number;
  outputUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  startTime: number;
  jobId?: string;
  prompt?: string;
  chainedFrom?: string; // previous result ID for chaining
  providerGenerationId?: string; // Luma generation ID for extend mode
}

interface LabGeneratePanelProps {
  className?: string;
  results: LabResult[];
  onResultCreated: (result: LabResult) => void;
  onResultUpdated: (id: string, updates: Partial<LabResult>) => void;
  onExtendReady?: (handler: (sourceUrl: string, engine: VideoEngine) => void) => void;
}

export function LabGeneratePanel({ 
  className, 
  results,
  onResultCreated,
  onResultUpdated,
  onExtendReady,
}: LabGeneratePanelProps) {
  const { toast } = useToast();
  
  // Shared state
  const [activeTab, setActiveTab] = useState<"video" | "voice">("video");
  
  // Video state
  const [selectedVideoEngine, setSelectedVideoEngine] = useState<VideoEngine>("sora");
  const [videoPrompt, setVideoPrompt] = useState("");
  const [duration, setDuration] = useState(4);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [stylePreset, setStylePreset] = useState("");
  const [chainMode, setChainMode] = useState(false);
  const [selectedChainSource, setSelectedChainSource] = useState<string>("");
  
  // Voice state
  const [voiceProvider, setVoiceProvider] = useState<VoiceEngine>("elevenlabs");
  const [voiceText, setVoiceText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("roger");
  const [stability, setStability] = useState(0.5);
  const [speed, setSpeed] = useState(1.0);

  const validDurations = ENGINE_DURATIONS[selectedVideoEngine];
  const voices = voiceProvider === "elevenlabs" ? ELEVENLABS_VOICES : OPENAI_VOICES;
  
  // Get completed videos for chaining
  const completedVideos = results.filter(r => r.type === "video" && r.status === "done" && r.outputUrl);

  // Auto-adjust duration when engine changes
  useEffect(() => {
    const validDuration = getValidDuration(selectedVideoEngine, duration);
    if (validDuration !== duration) {
      setDuration(validDuration);
    }
  }, [selectedVideoEngine, duration]);

  // Auto-switch voice when provider changes
  useEffect(() => {
    setSelectedVoice(voiceProvider === "elevenlabs" ? "roger" : "coral");
  }, [voiceProvider]);

  // Auto-select latest video for chaining
  useEffect(() => {
    if (chainMode && completedVideos.length > 0 && !selectedChainSource) {
      setSelectedChainSource(completedVideos[completedVideos.length - 1].id);
    }
  }, [chainMode, completedVideos, selectedChainSource]);

  const applyQuickStyle = (styleId: string) => {
    const style = QUICK_STYLES.find(s => s.id === styleId);
    if (style) {
      setVideoPrompt(prev => prev ? `${style.prompt}. ${prev}` : style.prompt);
      toast({ title: `Applied "${style.label}" style` });
    }
  };

  const applyTemplate = (templateId: string) => {
    const template = PROMPT_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setVideoPrompt(template.template);
      toast({ title: `Applied "${template.label}" template` });
    }
  };

  // Video generation mutation
  const videoMutation = useMutation({
    mutationFn: async ({ 
      engine, 
      extendGenerationId, 
      referenceImageUrl 
    }: { 
      engine: VideoEngine; 
      extendGenerationId?: string;  // Luma: seamless continuation
      referenceImageUrl?: string;   // Luma: visual reference
    }) => {
      const presetData = STYLE_PRESETS.find(p => p.id === stylePreset);
      const styleNotes = presetData?.guide?.custom_notes 
        ? `${presetData.guide.custom_notes}. ` 
        : "";
      const fullPrompt = stylePreset 
        ? `${styleNotes}${videoPrompt}`.trim()
        : videoPrompt;

      return generateVideo(engine, {
        prompt: fullPrompt,
        duration: getValidDuration(engine, duration),
        aspectRatio,
        style: stylePreset,
        extendGenerationId,
        referenceImageUrl,
      });
    },
    onSuccess: (data, variables) => {
      if (data.error) {
        toast({
          title: `${variables.engine} generation failed`,
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      const extendMode = variables.extendGenerationId ? "extend" : 
                         variables.referenceImageUrl ? "reference" : undefined;

      const result: LabResult = {
        id: data.jobId,
        type: "video",
        engine: variables.engine,
        jobId: data.jobId,
        status: "queued",
        progress: 0,
        startTime: Date.now(),
        prompt: videoPrompt,
        chainedFrom: extendMode,
        providerGenerationId: data.providerGenerationId,
      };
      
      onResultCreated(result);
      toast({
        title: extendMode 
          ? `${variables.engine} ${extendMode} queued` 
          : `${variables.engine} job queued`,
        description: `Job ID: ${data.jobId.slice(0, 8)}...`,
      });
    },
    onError: (error, variables) => {
      toast({
        title: `${variables.engine} generation failed`,
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Voice generation mutation
  const voiceMutation = useMutation({
    mutationFn: async () => {
      return generateVoice({
        text: voiceText,
        voice: selectedVoice,
        provider: voiceProvider,
        stability: voiceProvider === "elevenlabs" ? stability : undefined,
        speed,
      });
    },
    onSuccess: (data) => {
      if (data.error) {
        toast({
          title: "Voice generation failed",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      const result: LabResult = {
        id: `voice-${Date.now()}`,
        type: "audio",
        engine: data.provider,
        status: "done",
        progress: 100,
        outputUrl: data.audioUrl,
        startTime: Date.now(),
      };
      
      onResultCreated(result);
      toast({
        title: "Voice generated",
        description: `${data.provider} / ${data.voice}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Voice generation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleVideoGenerate = () => {
    if (!videoPrompt.trim()) {
      toast({ title: "Prompt required", variant: "destructive" });
      return;
    }
    videoMutation.mutate({ engine: selectedVideoEngine });
  };

  const handleVideoAB = () => {
    if (!videoPrompt.trim()) {
      toast({ title: "Prompt required", variant: "destructive" });
      return;
    }
    VIDEO_ENGINES.forEach(engine => videoMutation.mutate({ engine: engine.id }));
  };

  // Extend a completed Luma video (seamless continuation from generation ID)
  const handleExtendVideo = useCallback((generationId: string, engine: VideoEngine) => {
    if (!videoPrompt.trim()) {
      toast({ title: "Prompt required for extend", variant: "destructive" });
      return;
    }
    videoMutation.mutate({ engine, extendGenerationId: generationId });
  }, [videoPrompt, videoMutation, toast]);

  // Use image as visual reference (more creative freedom)
  const handleReferenceVideo = useCallback((imageUrl: string, engine: VideoEngine) => {
    if (!videoPrompt.trim()) {
      toast({ title: "Prompt required for reference", variant: "destructive" });
      return;
    }
    videoMutation.mutate({ engine, referenceImageUrl: imageUrl });
  }, [videoPrompt, videoMutation, toast]);

  // Expose handlers to parent
  useEffect(() => {
    onExtendReady?.((generationIdOrUrl: string, engine: VideoEngine) => {
      // Determine if this is a generation ID (UUID format) or URL
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(generationIdOrUrl);
      if (isUuid) {
        handleExtendVideo(generationIdOrUrl, engine);
      } else {
        handleReferenceVideo(generationIdOrUrl, engine);
      }
    });
  }, [onExtendReady, handleExtendVideo, handleReferenceVideo]);

  const handleVoiceGenerate = () => {
    if (!voiceText.trim()) {
      toast({ title: "Text required", variant: "destructive" });
      return;
    }
    voiceMutation.mutate();
  };

  const wordCount = voiceText.split(/\s+/).filter(Boolean).length;

  return (
    <div className={cn("flex flex-col", className)}>
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "video" | "voice")} className="flex flex-col">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="video" className="text-xs">
            <Video className="h-3 w-3 mr-1" /> Video
          </TabsTrigger>
          <TabsTrigger value="voice" className="text-xs">
            <Mic className="h-3 w-3 mr-1" /> Voice
          </TabsTrigger>
        </TabsList>

        {/* Video Tab */}
        <TabsContent value="video" className="flex flex-col gap-4 mt-0">
          {/* Engine Selector */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Engine</Label>
            <div className="flex gap-1">
              {VIDEO_ENGINES.map(engine => (
                <Button
                  key={engine.id}
                  size="sm"
                  variant={selectedVideoEngine === engine.id ? "default" : "outline"}
                  className="flex-1 h-8 text-xs"
                  onClick={() => setSelectedVideoEngine(engine.id)}
                >
                  {engine.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Quick Style Presets */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Quick Styles</Label>
            <div className="grid grid-cols-3 gap-2">
              {QUICK_STYLES.map(style => (
                <Button
                  key={style.id}
                  size="sm"
                  variant="outline"
                  className={cn("h-8 text-xs border justify-start", style.color)}
                  onClick={() => applyQuickStyle(style.id)}
                >
                  <style.icon className="h-3 w-3 mr-1.5 shrink-0" />
                  <span className="truncate">{style.label}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Prompt Templates */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Templates</Label>
            <div className="flex flex-wrap gap-1.5">
              {PROMPT_TEMPLATES.map(template => (
                <Badge
                  key={template.id}
                  variant="outline"
                  className="cursor-pointer hover:bg-secondary/50 text-xs py-1"
                  onClick={() => applyTemplate(template.id)}
                >
                  {template.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Prompt */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Visual Prompt</Label>
            <Textarea
              value={videoPrompt}
              onChange={(e) => setVideoPrompt(e.target.value)}
              placeholder="Describe the visual scene... or pick a quick style above"
              className="text-sm bg-secondary/30 border-border/50 min-h-[120px] resize-none"
            />
          </div>

          {/* Settings Row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Duration</Label>
              <Select value={duration.toString()} onValueChange={(v) => setDuration(Number(v))}>
                <SelectTrigger className="h-9 text-xs bg-popover border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border z-50">
                  {validDurations.map(d => (
                    <SelectItem key={d} value={d.toString()}>{d}s</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Aspect</Label>
              <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as typeof aspectRatio)}>
                <SelectTrigger className="h-9 text-xs bg-popover border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border z-50">
                  <SelectItem value="9:16">9:16</SelectItem>
                  <SelectItem value="16:9">16:9</SelectItem>
                  <SelectItem value="1:1">1:1</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Cinematic</Label>
              <Select value={stylePreset || "none"} onValueChange={(v) => setStylePreset(v === "none" ? "" : v)}>
                <SelectTrigger className="h-9 text-xs bg-popover border-border/50">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border z-50">
                  <SelectItem value="none">None</SelectItem>
                  {STYLE_PRESETS.map(preset => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.icon} {preset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Chain Mode Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50">
            <div className="flex items-center gap-3">
              <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <Label className="text-xs font-medium">Chain Mode</Label>
                <p className="text-[10px] text-muted-foreground">Use last frame as reference</p>
              </div>
            </div>
            <Switch
              checked={chainMode}
              onCheckedChange={setChainMode}
              disabled={completedVideos.length === 0}
            />
          </div>

          {chainMode && completedVideos.length > 0 && (
            <Select value={selectedChainSource} onValueChange={setSelectedChainSource}>
              <SelectTrigger className="h-9 text-xs bg-popover border-border/50">
                <SelectValue placeholder="Select source video" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                {completedVideos.map(v => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.engine} — {v.id.slice(0, 8)}...
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}


          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleVideoGenerate}
              disabled={videoMutation.isPending || !videoPrompt.trim()}
              className="flex-1 h-10"
            >
              {videoMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Generate
            </Button>
            <Button
              variant="secondary"
              onClick={handleVideoAB}
              disabled={videoMutation.isPending || !videoPrompt.trim()}
              title="A/B test all 3 engines"
              className="h-10 px-4"
            >
              <Beaker className="h-4 w-4 mr-1.5" />
              A/B
            </Button>
          </div>
        </TabsContent>

        {/* Voice Tab */}
        <TabsContent value="voice" className="flex flex-col gap-4 mt-0">
          {/* Provider */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Provider</Label>
            <div className="flex gap-1">
              {VOICE_ENGINES.map(engine => (
                <Button
                  key={engine.id}
                  size="sm"
                  variant={voiceProvider === engine.id ? "default" : "outline"}
                  className="flex-1 h-8 text-xs"
                  onClick={() => setVoiceProvider(engine.id)}
                >
                  {engine.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Text Input */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs text-muted-foreground">Text to Speak</Label>
              <span className="text-[10px] text-muted-foreground">
                {wordCount} words
              </span>
            </div>
            <Textarea
              value={voiceText}
              onChange={(e) => setVoiceText(e.target.value)}
              placeholder="Enter text to convert to speech..."
              className="text-sm bg-secondary/30 border-border/50 min-h-[120px] resize-none"
            />
          </div>

          {/* Voice Selection */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Voice</Label>
            <Select value={selectedVoice} onValueChange={setSelectedVoice}>
              <SelectTrigger className="h-9 text-xs bg-popover border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                {voices.map(v => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name} — {v.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Voice Settings */}
          <div className="grid grid-cols-2 gap-4">
            {voiceProvider === "elevenlabs" && (
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Stability</Label>
                  <span className="text-[10px] text-muted-foreground">{stability.toFixed(2)}</span>
                </div>
                <Slider
                  value={[stability]}
                  onValueChange={([v]) => setStability(v)}
                  min={0}
                  max={1}
                  step={0.05}
                />
              </div>
            )}
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Speed</Label>
                <span className="text-[10px] text-muted-foreground">{speed.toFixed(1)}x</span>
              </div>
              <Slider
                value={[speed]}
                onValueChange={([v]) => setSpeed(v)}
                min={0.7}
                max={1.3}
                step={0.1}
              />
            </div>
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleVoiceGenerate}
            disabled={voiceMutation.isPending || !voiceText.trim()}
            className="w-full h-10"
          >
            {voiceMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Mic className="h-4 w-4 mr-2" />
            )}
            Generate Voice
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
