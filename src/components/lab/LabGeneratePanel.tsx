import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Video, Mic, Loader2, Play, Beaker } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
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
  error?: string;
  startTime: number;
  jobId?: string;
}

interface LabGeneratePanelProps {
  className?: string;
  onResultCreated: (result: LabResult) => void;
  onResultUpdated: (id: string, updates: Partial<LabResult>) => void;
}

export function LabGeneratePanel({ 
  className, 
  onResultCreated,
  onResultUpdated,
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
  
  // Voice state
  const [voiceProvider, setVoiceProvider] = useState<VoiceEngine>("elevenlabs");
  const [voiceText, setVoiceText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("roger");
  const [stability, setStability] = useState(0.5);
  const [speed, setSpeed] = useState(1.0);

  const validDurations = ENGINE_DURATIONS[selectedVideoEngine];
  const voices = voiceProvider === "elevenlabs" ? ELEVENLABS_VOICES : OPENAI_VOICES;

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

  // Video generation mutation
  const videoMutation = useMutation({
    mutationFn: async (engine: VideoEngine) => {
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
      });
    },
    onSuccess: (data, engine) => {
      if (data.error) {
        toast({
          title: `${engine} generation failed`,
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      const result: LabResult = {
        id: data.jobId,
        type: "video",
        engine,
        jobId: data.jobId,
        status: "queued",
        progress: 0,
        startTime: Date.now(),
      };
      
      onResultCreated(result);
      toast({
        title: `${engine} job queued`,
        description: `Job ID: ${data.jobId.slice(0, 8)}...`,
      });
    },
    onError: (error, engine) => {
      toast({
        title: `${engine} generation failed`,
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
    videoMutation.mutate(selectedVideoEngine);
  };

  const handleVideoAB = () => {
    if (!videoPrompt.trim()) {
      toast({ title: "Prompt required", variant: "destructive" });
      return;
    }
    VIDEO_ENGINES.forEach(engine => videoMutation.mutate(engine.id));
  };

  const handleVoiceGenerate = () => {
    if (!voiceText.trim()) {
      toast({ title: "Text required", variant: "destructive" });
      return;
    }
    voiceMutation.mutate();
  };

  const wordCount = voiceText.split(/\s+/).filter(Boolean).length;

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "video" | "voice")} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="video" className="text-xs">
            <Video className="h-3 w-3 mr-1" /> Video
          </TabsTrigger>
          <TabsTrigger value="voice" className="text-xs">
            <Mic className="h-3 w-3 mr-1" /> Voice
          </TabsTrigger>
        </TabsList>

        {/* Video Tab */}
        <TabsContent value="video" className="flex-1 flex flex-col gap-4 mt-0">
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
            <p className="text-[10px] text-muted-foreground">
              {VIDEO_ENGINES.find(e => e.id === selectedVideoEngine)?.description}
            </p>
          </div>

          {/* Prompt */}
          <div className="space-y-2 flex-1">
            <Label className="text-xs text-muted-foreground">Visual Prompt</Label>
            <Textarea
              value={videoPrompt}
              onChange={(e) => setVideoPrompt(e.target.value)}
              placeholder="Describe the visual scene..."
              className="text-xs bg-secondary/30 border-border/30 min-h-[100px] resize-none"
            />
          </div>

          {/* Settings */}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Duration</Label>
              <Select value={duration.toString()} onValueChange={(v) => setDuration(Number(v))}>
                <SelectTrigger className="h-8 text-xs bg-popover">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {validDurations.map(d => (
                    <SelectItem key={d} value={d.toString()}>{d}s</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Aspect</Label>
              <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as typeof aspectRatio)}>
                <SelectTrigger className="h-8 text-xs bg-popover">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="9:16">9:16</SelectItem>
                  <SelectItem value="16:9">16:9</SelectItem>
                  <SelectItem value="1:1">1:1</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Style</Label>
              <Select value={stylePreset || "none"} onValueChange={(v) => setStylePreset(v === "none" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs bg-popover">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="none">None</SelectItem>
                  {STYLE_PRESETS.map(preset => (
                    <SelectItem key={preset.id} value={preset.id}>{preset.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              onClick={handleVideoGenerate}
              disabled={videoMutation.isPending || !videoPrompt.trim()}
              className="flex-1"
            >
              {videoMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Generate
            </Button>
            <Button
              variant="outline"
              onClick={handleVideoAB}
              disabled={videoMutation.isPending || !videoPrompt.trim()}
              title="A/B test all engines"
            >
              <Beaker className="h-4 w-4" />
            </Button>
          </div>
        </TabsContent>

        {/* Voice Tab */}
        <TabsContent value="voice" className="flex-1 flex flex-col gap-4 mt-0">
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
          <div className="space-y-2 flex-1">
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
              className="text-xs bg-secondary/30 border-border/30 min-h-[100px] resize-none"
            />
          </div>

          {/* Voice Selection */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Voice</Label>
            <Select value={selectedVoice} onValueChange={setSelectedVoice}>
              <SelectTrigger className="h-8 text-xs bg-popover">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
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
                  <Label className="text-[10px] text-muted-foreground">Stability</Label>
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
                <Label className="text-[10px] text-muted-foreground">Speed</Label>
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
            className="w-full"
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
