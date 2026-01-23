import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Mic, Loader2, Play, Pause, Volume2, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface VoiceoverGeneratorProps {
  scriptId: string;
  voiceoverText: string;
  existingAudioUrl?: string | null;
  existingVoice?: string | null;
  existingProvider?: string | null;
  className?: string;
}

type VoiceProvider = "elevenlabs" | "openai";

interface VoiceOption {
  id: string;
  name: string;
  description: string;
  provider: VoiceProvider;
}

// ElevenLabs voices - high quality narration
const ELEVENLABS_VOICES: VoiceOption[] = [
  { id: "roger", name: "Roger", description: "Deep, authoritative", provider: "elevenlabs" },
  { id: "sarah", name: "Sarah", description: "Warm, friendly", provider: "elevenlabs" },
  { id: "charlie", name: "Charlie", description: "Young, energetic", provider: "elevenlabs" },
  { id: "george", name: "George", description: "British, refined", provider: "elevenlabs" },
  { id: "liam", name: "Liam", description: "Neutral, clear", provider: "elevenlabs" },
  { id: "jessica", name: "Jessica", description: "Warm, conversational", provider: "elevenlabs" },
  { id: "eric", name: "Eric", description: "Professional, smooth", provider: "elevenlabs" },
  { id: "brian", name: "Brian", description: "Deep, dramatic", provider: "elevenlabs" },
  { id: "lily", name: "Lily", description: "Soft, intimate", provider: "elevenlabs" },
  { id: "chris", name: "Chris", description: "Casual, relatable", provider: "elevenlabs" },
];

// OpenAI voices - fallback/alternative
const OPENAI_VOICES: VoiceOption[] = [
  { id: "coral", name: "Coral", description: "Warm, conversational", provider: "openai" },
  { id: "sage", name: "Sage", description: "Calm, measured", provider: "openai" },
  { id: "ash", name: "Ash", description: "Clear, direct", provider: "openai" },
  { id: "ballad", name: "Ballad", description: "Expressive, storytelling", provider: "openai" },
  { id: "verse", name: "Verse", description: "Dynamic, engaging", provider: "openai" },
  { id: "shimmer", name: "Shimmer", description: "Bright, energetic", provider: "openai" },
];

const ALL_VOICES = [...ELEVENLABS_VOICES, ...OPENAI_VOICES];

/**
 * UI for generating and previewing TTS voiceover audio.
 * Supports ElevenLabs (primary) and OpenAI (fallback).
 */
export function VoiceoverGenerator({
  scriptId,
  voiceoverText,
  existingAudioUrl,
  existingVoice,
  existingProvider,
  className,
}: VoiceoverGeneratorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [voice, setVoice] = useState(existingVoice || "roger");
  const [instructions, setInstructions] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  // Get the provider for the selected voice
  const selectedVoiceData = ALL_VOICES.find(v => v.id === voice);
  const provider: VoiceProvider = selectedVoiceData?.provider || "elevenlabs";

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-voiceover", {
        body: {
          script_run_id: scriptId,
          voice,
          provider,
          instructions: instructions.trim() || undefined,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      const providerLabel = data.provider === "elevenlabs" ? "ElevenLabs" : "OpenAI";
      toast({ 
        title: "Voiceover generated", 
        description: `Using ${data.voice} (${providerLabel})` 
      });
      queryClient.invalidateQueries({ queryKey: ["script-run", scriptId] });
      
      // Play the new audio
      if (data.audio_url) {
        playAudio(data.audio_url);
      }
    },
    onError: (error) => {
      toast({
        title: "Failed to generate voiceover",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const playAudio = (url: string) => {
    // Stop any existing playback
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }

    const audio = new Audio(url);
    audio.onended = () => setIsPlaying(false);
    audio.onpause = () => setIsPlaying(false);
    audio.onplay = () => setIsPlaying(true);
    
    setAudioElement(audio);
    audio.play().catch(console.error);
  };

  const togglePlayback = () => {
    if (!existingAudioUrl) return;

    if (isPlaying && audioElement) {
      audioElement.pause();
    } else if (audioElement) {
      audioElement.play().catch(console.error);
    } else {
      playAudio(existingAudioUrl);
    }
  };

  const wordCount = voiceoverText.split(/\s+/).filter(Boolean).length;
  const estimatedDuration = Math.ceil(wordCount / 2.5); // ~150 words per minute

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with existing audio player */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Voiceover Audio
          </span>
        </div>
        
        {existingAudioUrl && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5"
            onClick={togglePlayback}
          >
            {isPlaying ? (
              <Pause className="h-3 w-3" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            <span className="text-xs">Preview</span>
          </Button>
        )}
      </div>

      {/* Status */}
      {existingAudioUrl ? (
        <div className="flex items-center gap-2 p-2 rounded bg-success/10 border border-success/30">
          <Volume2 className="h-4 w-4 text-success" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-success font-medium">Audio generated</p>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">
                Voice: {existingVoice || "roger"}
              </span>
              {existingProvider && (
                <Badge variant="outline" className="h-4 text-[9px] px-1">
                  {existingProvider === "elevenlabs" ? (
                    <><Sparkles className="h-2.5 w-2.5 mr-0.5" />11Labs</>
                  ) : (
                    <><Zap className="h-2.5 w-2.5 mr-0.5" />OpenAI</>
                  )}
                </Badge>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-2 rounded bg-secondary/30 border border-border/30">
          <p className="text-xs text-muted-foreground">
            No audio yet • Est. {estimatedDuration}s from {wordCount} words
          </p>
        </div>
      )}

      {/* Voice selection with provider grouping */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Voice</Label>
          <Badge variant="outline" className="h-5 text-[10px]">
            {provider === "elevenlabs" ? (
              <><Sparkles className="h-3 w-3 mr-1 text-violet-500" />ElevenLabs</>
            ) : (
              <><Zap className="h-3 w-3 mr-1 text-emerald-500" />OpenAI</>
            )}
          </Badge>
        </div>
        <Select value={voice} onValueChange={setVoice}>
          <SelectTrigger className="h-8 text-xs bg-secondary/30">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              ElevenLabs (Recommended)
            </div>
            {ELEVENLABS_VOICES.map((v) => (
              <SelectItem key={v.id} value={v.id} className="text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{v.name}</span>
                  <span className="text-muted-foreground">— {v.description}</span>
                </div>
              </SelectItem>
            ))}
            <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider border-t mt-1 pt-2">
              OpenAI (Alternative)
            </div>
            {OPENAI_VOICES.map((v) => (
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

      {/* Custom instructions - only show for OpenAI */}
      {provider === "openai" && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            Custom instructions (OpenAI only)
          </Label>
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g., Speak with excitement, pause after questions..."
            className="text-xs bg-secondary/30 border-border/30 min-h-[60px] resize-none"
          />
        </div>
      )}

      {/* Generate button */}
      <Button
        onClick={() => generateMutation.mutate()}
        disabled={generateMutation.isPending || !voiceoverText.trim()}
        className="w-full h-9"
      >
        {generateMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Generating...
          </>
        ) : existingAudioUrl ? (
          <>
            <Mic className="h-4 w-4 mr-2" />
            Regenerate Audio
          </>
        ) : (
          <>
            {provider === "elevenlabs" ? (
              <Sparkles className="h-4 w-4 mr-2" />
            ) : (
              <Mic className="h-4 w-4 mr-2" />
            )}
            Generate Voiceover
          </>
        )}
      </Button>
    </div>
  );
}
