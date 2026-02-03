import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Loader2, ChevronDown, Volume2, Play, Pause, Mic, FileText, Clock, RefreshCw } from "lucide-react";
import { useStoryNarration, VOICE_PRESETS, type WordTiming } from "@/hooks/use-story-voiceover";
import { cn } from "@/lib/utils";

interface StoryNarrationPanelProps {
  storyJobId: string;
  storyType?: string;
  onTimingUpdate?: (currentMs: number, sceneIndex: number) => void;
}

export function StoryNarrationPanel({
  storyJobId,
  storyType = "myth",
  onTimingUpdate,
}: StoryNarrationPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState<string>(storyType);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [currentWord, setCurrentWord] = useState<WordTiming | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const {
    compiledScript,
    sceneSegments,
    audioUrl,
    actualTiming,
    totalDurationMs,
    status,
    error,
    isCompiling,
    isGenerating,
    isProcessing,
    hasScript,
    hasAudio,
    voiceName,
    compileAndGenerate,
    findCurrentWord,
    hasWordTimestamps,
    alignmentDebug,
  } = useStoryNarration(storyJobId, storyType);

  // Audio playback sync with proper lifecycle management
  useEffect(() => {
    if (!audioUrl) {
      audioRef.current = null;
      return;
    }

    const audio = new Audio(audioUrl);
    audio.preload = "auto";
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      const currentMs = audio.currentTime * 1000;
      setCurrentTimeMs(currentMs);

      // Find current word and scene using char spans
      const { word, sceneIndex } = findCurrentWord(currentMs);
      setCurrentWord(word);

      if (sceneIndex !== null) {
        onTimingUpdate?.(currentMs, sceneIndex);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTimeMs(0);
      setCurrentWord(null);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.pause();
      audio.src = ""; // Release resources
      audioRef.current = null;
    };
  }, [audioUrl, findCurrentWord, onTimingUpdate]);

  const togglePlayback = async () => {
    if (!audioRef.current) {
      console.error("[NarrationPanel] No audio element available");
      return;
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (err) {
        console.error("[NarrationPanel] Play failed:", err);
        // Attempt to reload and play
        audioRef.current.load();
        try {
          await audioRef.current.play();
          setIsPlaying(true);
        } catch (retryErr) {
          console.error("[NarrationPanel] Retry play failed:", retryErr);
        }
      }
    }
  };

  const handleGenerate = async () => {
    const preset = VOICE_PRESETS[selectedVoice as keyof typeof VOICE_PRESETS] || VOICE_PRESETS.myth;
    await compileAndGenerate({
      voice_id: preset.voice_id,
      voice_name: preset.voice_name,
    });
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const progress = totalDurationMs ? (currentTimeMs / totalDurationMs) * 100 : 0;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-primary/20">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-medium">Narration</CardTitle>
                {hasAudio && (
                  <Badge variant="secondary" className="text-xs tabular-nums">
                    {formatDuration(totalDurationMs || 0)}
                  </Badge>
                )}
                {status === "done" && <Badge className="bg-green-500/20 text-green-500 text-xs">Ready</Badge>}
                {status === "failed" && <Badge variant="destructive" className="text-xs">Failed</Badge>}
                {isProcessing && (
                  <Badge variant="outline" className="text-xs">
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    {isCompiling ? "Compiling..." : "Generating..."}
                  </Badge>
                )}
              </div>
              <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Voice Selection */}
            <div className="flex items-center gap-2">
              <Select value={selectedVoice} onValueChange={setSelectedVoice} disabled={isProcessing}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select voice" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(VOICE_PRESETS).map(([key, preset]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex flex-col">
                        <span>{preset.voice_name}</span>
                        <span className="text-xs text-muted-foreground">{preset.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                onClick={handleGenerate}
                disabled={isProcessing}
                size="sm"
                className="flex-1"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    {isCompiling ? "Compiling Script..." : "Generating Audio..."}
                  </>
                ) : hasAudio ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Regenerate
                  </>
                ) : (
                  <>
                    <Volume2 className="h-4 w-4 mr-2" />
                    Generate Voiceover
                  </>
                )}
              </Button>
            </div>

            {/* Error Display */}
            {error && (
              <div className="p-2 bg-destructive/10 text-destructive text-sm rounded-md">
                {error}
              </div>
            )}

            {/* Audio Player */}
            {hasAudio && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={togglePlayback}
                    className="w-10 h-10 p-0"
                  >
                    {isPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                  <div className="flex-1 space-y-1">
                    <Progress value={progress} className="h-2" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{formatDuration(currentTimeMs)}</span>
                      <span>{formatDuration(totalDurationMs || 0)}</span>
                    </div>
                  </div>
                </div>
                
                {/* Word sync status indicator */}
                {!hasWordTimestamps && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                    <Clock className="h-3 w-3" />
                    <span>Word sync unavailable — using estimated scene timing</span>
                    {alignmentDebug?.fallback_reason && (
                      <span className="text-[10px] text-muted-foreground/70">({alignmentDebug.fallback_reason})</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Compiled Script Display with char-span highlighting */}
            {hasScript && compiledScript && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4" />
                  Compiled Script
                </div>
                <ScrollArea className="h-32 rounded-md border p-3 bg-muted/30">
                  <p className="text-sm leading-relaxed">
                    <ScriptWithHighlight 
                      script={compiledScript} 
                      currentWord={currentWord} 
                    />
                  </p>
                </ScrollArea>
              </div>
            )}

            {/* Scene Segments with Timing */}
            {sceneSegments.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="h-4 w-4" />
                  Scene Timing
                </div>
                <div className="space-y-1">
                  {sceneSegments.map((segment, idx) => {
                    const timing = actualTiming.find((t) => t.scene_index === segment.scene_index);
                    const isActive =
                      timing &&
                      currentTimeMs >= timing.start_ms &&
                      currentTimeMs <= timing.end_ms;

                    return (
                      <div
                        key={idx}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-md text-xs transition-colors",
                          isActive ? "bg-primary/20" : "bg-muted/30"
                        )}
                      >
                        <Badge variant="outline" className="w-8 justify-center">
                          {segment.scene_index + 1}
                        </Badge>
                        <span className="flex-1 truncate">{segment.text.slice(0, 50)}...</span>
                        <span className="text-muted-foreground tabular-nums">
                          {timing
                            ? `${formatDuration(timing.start_ms)} - ${formatDuration(timing.end_ms)}`
                            : `~${Math.round(segment.estimated_duration_ms / 1000)}s`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty State */}
            {!hasScript && !isProcessing && (
              <div className="text-center py-4 text-muted-foreground text-sm">
                <Mic className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No voiceover yet.</p>
                <p className="text-xs">Click "Generate Voiceover" to create narration from your scene scripts.</p>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// Component to render script with reliable char-span based highlighting
interface ScriptWithHighlightProps {
  script: string;
  currentWord: WordTiming | null;
}

function ScriptWithHighlight({ script, currentWord }: ScriptWithHighlightProps) {
  // Memoize the highlighted text to avoid unnecessary re-renders
  const highlightedContent = useMemo(() => {
    if (!currentWord) {
      return script;
    }

    const { char_start, char_end } = currentWord;
    
    // Validate indices
    if (char_start < 0 || char_end > script.length || char_start >= char_end) {
      return script;
    }

    const before = script.slice(0, char_start);
    const highlighted = script.slice(char_start, char_end);
    const after = script.slice(char_end);

    return (
      <>
        {before}
        <span className="bg-primary text-primary-foreground px-0.5 rounded">
          {highlighted}
        </span>
        {after}
      </>
    );
  }, [script, currentWord]);

  return <>{highlightedContent}</>;
}
