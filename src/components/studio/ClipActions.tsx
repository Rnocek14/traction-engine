import { useState } from "react";
import {
  Wand2,
  FastForward,
  Settings2,
  Loader2,
  Film,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useRegenerateClip, useExtendClip } from "@/hooks/use-clip-generation";
import type { Clip } from "@/types/timeline-types";

interface ClipActionsProps {
  clip: Clip | null;
  scriptId: string;
  onClipUpdated?: () => void;
  className?: string;
}

const STYLE_PRESETS = [
  { value: "cinematic", label: "Cinematic", desc: "Wide shots, dramatic lighting" },
  { value: "handheld", label: "Handheld", desc: "Organic, documentary feel" },
  { value: "macro", label: "Macro", desc: "Close-up detail shots" },
  { value: "broll", label: "B-Roll", desc: "Atmospheric cutaway footage" },
  { value: "montage", label: "Montage", desc: "Quick cuts, high energy" },
];

const SIZE_OPTIONS = [
  { value: "1920x1080", label: "1080p (16:9)" },
  { value: "1280x720", label: "720p (16:9)" },
  { value: "1080x1920", label: "9:16 Vertical" },
  { value: "1080x1080", label: "1:1 Square" },
];

const DURATION_OPTIONS = [
  { value: 4, label: "4 seconds" },
  { value: 8, label: "8 seconds" },
  { value: 12, label: "12 seconds" },
];

/**
 * Actions panel for selected clip - regenerate, extend, style options
 */
export function ClipActions({ clip, scriptId, onClipUpdated, className }: ClipActionsProps) {
  const [isRegenOpen, setIsRegenOpen] = useState(false);
  const [isExtendOpen, setIsExtendOpen] = useState(false);

  // Regenerate state
  const [regenPrompt, setRegenPrompt] = useState("");
  const [regenStyle, setRegenStyle] = useState<string>("");
  const [regenSize, setRegenSize] = useState("1920x1080");
  const [regenDuration, setRegenDuration] = useState(4);

  // Extend state
  const [extendDuration, setExtendDuration] = useState(4);
  const [extendPrompt, setExtendPrompt] = useState("");

  const regenerateClip = useRegenerateClip();
  const extendClip = useExtendClip();

  const handleRegenerate = async () => {
    if (!clip) return;

    await regenerateClip.mutateAsync({
      clip,
      scriptId,
      newPrompt: regenPrompt || undefined,
      style: regenStyle || undefined,
      size: regenSize,
      durationSeconds: regenDuration,
    });

    setIsRegenOpen(false);
    setRegenPrompt("");
    onClipUpdated?.();
  };

  const handleExtend = async () => {
    if (!clip) return;

    await extendClip.mutateAsync({
      clip,
      scriptId,
      additionalSeconds: extendDuration,
      continuationPrompt: extendPrompt || undefined,
    });

    setIsExtendOpen(false);
    setExtendPrompt("");
    onClipUpdated?.();
  };

  // Reset forms when clip changes
  const resetForms = () => {
    setRegenPrompt(clip?.prompt || "");
    setRegenStyle("");
  };

  if (!clip) {
    return (
      <div className={cn("p-4 text-center text-muted-foreground text-sm", className)}>
        Select a clip to see actions
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Quick actions */}
      <div className="flex gap-2">
        {/* Regenerate */}
        <Dialog open={isRegenOpen} onOpenChange={(open) => {
          setIsRegenOpen(open);
          if (open) resetForms();
        }}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="flex-1">
              <Wand2 className="h-3.5 w-3.5 mr-1.5" />
              Regenerate
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Regenerate Clip</DialogTitle>
              <DialogDescription>
                Generate a new version of this clip with updated settings
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Prompt</Label>
                <Textarea
                  value={regenPrompt}
                  onChange={(e) => setRegenPrompt(e.target.value)}
                  placeholder={clip.prompt || "Enter scene prompt..."}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Style Preset</Label>
                <Select value={regenStyle} onValueChange={setRegenStyle}>
                  <SelectTrigger>
                    <SelectValue placeholder="No style preset" />
                  </SelectTrigger>
                  <SelectContent>
                    {STYLE_PRESETS.map((style) => (
                      <SelectItem key={style.value} value={style.value}>
                        <div>
                          <span className="font-medium">{style.label}</span>
                          <span className="text-muted-foreground text-xs ml-2">
                            {style.desc}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Size</Label>
                  <Select value={regenSize} onValueChange={setRegenSize}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SIZE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Duration</Label>
                  <Select
                    value={String(regenDuration)}
                    onValueChange={(v) => setRegenDuration(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={String(opt.value)}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIsRegenOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleRegenerate}
                disabled={regenerateClip.isPending}
              >
                {regenerateClip.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Regenerate
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Extend */}
        <Dialog open={isExtendOpen} onOpenChange={setIsExtendOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="flex-1">
              <FastForward className="h-3.5 w-3.5 mr-1.5" />
              Extend
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Extend Clip</DialogTitle>
              <DialogDescription>
                Continue the video seamlessly from the last frame
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Extension Duration</Label>
                <Select
                  value={String(extendDuration)}
                  onValueChange={(v) => setExtendDuration(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Continuation Prompt (optional)</Label>
                <Textarea
                  value={extendPrompt}
                  onChange={(e) => setExtendPrompt(e.target.value)}
                  placeholder="Describe how the scene should continue..."
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to auto-continue from current scene
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIsExtendOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleExtend} disabled={extendClip.isPending}>
                {extendClip.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Film className="h-4 w-4 mr-2" />
                )}
                Extend
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Clip info */}
      <div className="p-3 bg-secondary/20 rounded-lg space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Duration</span>
          <span className="font-mono">{(clip.end - clip.start).toFixed(1)}s</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Type</span>
          <span className="capitalize">{clip.type}</span>
        </div>
        {clip.source?.video_job_id && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Video Job</span>
            <span className="font-mono text-xs">{clip.source.video_job_id.slice(0, 8)}</span>
          </div>
        )}
      </div>

      {/* Prompt preview */}
      {clip.prompt && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Prompt</Label>
          <p className="text-sm p-2 bg-secondary/10 rounded border border-border/30">
            {clip.prompt}
          </p>
        </div>
      )}
    </div>
  );
}
