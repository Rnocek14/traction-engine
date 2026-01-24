import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Mic, Loader2, Play, Pause, Download, RefreshCw, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { VoiceEngine, VOICE_ENGINES, generateVoice, VoiceInput } from "@/lib/lab-engines";

interface VoicePanelProps {
  className?: string;
  initialText?: string;
  onAudioGenerated?: (url: string) => void;
}

// ElevenLabs voices
const ELEVENLABS_VOICES = [
  { id: "roger", name: "Roger", description: "Deep, authoritative" },
  { id: "sarah", name: "Sarah", description: "Warm, friendly" },
  { id: "charlie", name: "Charlie", description: "Young, energetic" },
  { id: "george", name: "George", description: "British, refined" },
  { id: "liam", name: "Liam", description: "Neutral, clear" },
  { id: "jessica", name: "Jessica", description: "Warm, conversational" },
  { id: "eric", name: "Eric", description: "Professional, smooth" },
  { id: "brian", name: "Brian", description: "Deep, dramatic" },
  { id: "lily", name: "Lily", description: "Soft, intimate" },
  { id: "chris", name: "Chris", description: "Casual, relatable" },
];

// OpenAI voices
const OPENAI_VOICES = [
  { id: "coral", name: "Coral", description: "Warm, conversational" },
  { id: "sage", name: "Sage", description: "Calm, measured" },
  { id: "ash", name: "Ash", description: "Clear, direct" },
  { id: "ballad", name: "Ballad", description: "Expressive, storytelling" },
  { id: "verse", name: "Verse", description: "Dynamic, engaging" },
  { id: "shimmer", name: "Shimmer", description: "Bright, energetic" },
];

export function VoicePanel({ className, initialText = "", onAudioGenerated }: VoicePanelProps) {
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [text, setText] = useState(initialText);
  const [provider, setProvider] = useState<VoiceEngine>("elevenlabs");
  const [voice, setVoice] = useState("roger");
  const [stability, setStability] = useState(0.5);
  const [speed, setSpeed] = useState(1.0);
  const [instructions, setInstructions] = useState("");

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [generationTime, setGenerationTime] = useState<number | null>(null);

  const voices = provider === "elevenlabs" ? ELEVENLABS_VOICES : OPENAI_VOICES;

  // Auto-switch voice when provider changes
  const handleProviderChange = (newProvider: VoiceEngine) => {
    setProvider(newProvider);
    setVoice(newProvider === "elevenlabs" ? "roger" : "coral");
  };

  const generateMutation = useMutation({
    mutationFn: async () => {
      const startTime = Date.now();
      const result = await generateVoice({
        text,
        voice,
        provider,
        stability: provider === "elevenlabs" ? stability : undefined,
        speed,
        instructions: provider === "openai" ? instructions : undefined,
      });
      return { ...result, generationTime: Date.now() - startTime };
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

      setAudioUrl(data.audioUrl);
      setGenerationTime(data.generationTime);
      onAudioGenerated?.(data.audioUrl);

      toast({
        title: "Voice generated",
        description: `${data.provider} / ${data.voice} in ${(data.generationTime / 1000).toFixed(1)}s`,
      });

      // Auto-play
      if (data.audioUrl && audioRef.current) {
        audioRef.current.src = data.audioUrl;
        audioRef.current.play().catch(console.error);
      }
    },
    onError: (error) => {
      toast({
        title: "Voice generation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const togglePlayback = () => {
    if (!audioRef.current || !audioUrl) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = `voice-${voice}-${Date.now()}.mp3`;
    a.click();
  };

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const estimatedDuration = Math.ceil(wordCount / 2.5);

  return (
    <div className={cn("flex flex-col gap-4 p-4", className)}>
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Voice Engine Testing
          </span>
        </div>
        {audioUrl && (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={togglePlayback}>
              {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDownload}>
              <Download className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Provider Toggle */}
      <div className="flex gap-2">
        {VOICE_ENGINES.map(engine => (
          <Button
            key={engine.id}
            variant={provider === engine.id ? "default" : "outline"}
            size="sm"
            className="flex-1 h-8"
            onClick={() => handleProviderChange(engine.id)}
          >
            {engine.id === "elevenlabs" ? (
              <Sparkles className="h-3 w-3 mr-1" />
            ) : (
              <Zap className="h-3 w-3 mr-1" />
            )}
            {engine.name}
          </Button>
        ))}
      </div>

      {/* Text Input */}
      <div className="space-y-2">
        <div className="flex justify-between">
          <Label className="text-xs text-muted-foreground">Text to Speak</Label>
          <span className="text-[10px] text-muted-foreground">
            {wordCount} words • ~{estimatedDuration}s
          </span>
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter text to convert to speech..."
          className="text-xs bg-secondary/30 border-border/30 min-h-[80px] resize-none"
        />
      </div>

      {/* Voice Selection */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Voice</Label>
        <Select value={voice} onValueChange={setVoice}>
          <SelectTrigger className="h-8 text-xs bg-secondary/30">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {voices.map(v => (
              <SelectItem key={v.id} value={v.id} className="text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{v.name}</span>
                  <span className="text-muted-foreground">— {v.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ElevenLabs-specific controls */}
      {provider === "elevenlabs" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs text-muted-foreground">Stability</Label>
              <span className="text-[10px] text-muted-foreground">{stability.toFixed(2)}</span>
            </div>
            <Slider
              value={[stability]}
              onValueChange={([v]) => setStability(v)}
              min={0}
              max={1}
              step={0.05}
              className="w-full"
            />
            <p className="text-[10px] text-muted-foreground">
              Lower = more expressive, higher = more consistent
            </p>
          </div>
        </div>
      )}

      {/* OpenAI-specific controls */}
      {provider === "openai" && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Instructions</Label>
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g., Speak with excitement, pause after questions..."
            className="text-xs bg-secondary/30 border-border/30 min-h-[50px] resize-none"
          />
        </div>
      )}

      {/* Speed control (both providers) */}
      <div className="space-y-2">
        <div className="flex justify-between">
          <Label className="text-xs text-muted-foreground">Speed</Label>
          <span className="text-[10px] text-muted-foreground">{speed.toFixed(1)}x</span>
        </div>
        <Slider
          value={[speed]}
          onValueChange={([v]) => setSpeed(v)}
          min={0.7}
          max={1.3}
          step={0.1}
          className="w-full"
        />
      </div>

      {/* Generate Button */}
      <Button
        onClick={() => generateMutation.mutate()}
        disabled={generateMutation.isPending || !text.trim()}
        className="w-full"
      >
        {generateMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Generating...
          </>
        ) : audioUrl ? (
          <>
            <RefreshCw className="h-4 w-4 mr-2" />
            Regenerate Voice
          </>
        ) : (
          <>
            <Mic className="h-4 w-4 mr-2" />
            Generate Voice
          </>
        )}
      </Button>

      {/* Status */}
      {audioUrl && (
        <div className="flex items-center gap-2 p-2 rounded bg-success/10 border border-success/30">
          <Mic className="h-4 w-4 text-success" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-success font-medium">Audio ready</p>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">
                {provider} / {voice}
              </span>
              {generationTime && (
                <Badge variant="outline" className="h-4 text-[9px] px-1">
                  {(generationTime / 1000).toFixed(1)}s
                </Badge>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
