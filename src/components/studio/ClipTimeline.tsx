import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Volume2,
  Scissors,
  Trash2,
  Copy,
  EyeOff,
  Plus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAudioWaveform } from "@/hooks/use-audio-waveform";
import type { Clip } from "@/types/timeline-types";

interface ClipTimelineProps {
  clips: Clip[];
  selectedClipIds: Set<string>;
  playheadPosition: number;
  duration: number;
  voiceover?: string;
  audioUrl?: string | null;
  onClipSelect: (clipId: string, multi?: boolean) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onPlayheadChange: (position: number) => void;
  onSplit: () => void;
  onDelete: (ripple?: boolean) => void;
  onDuplicate: () => void;
  onToggleDisabled: () => void;
  onAddClip: () => void;
  className?: string;
}

/**
 * DaVinci-style clip timeline with drag-and-drop, selection, and editing tools.
 */
export function ClipTimeline({
  clips,
  selectedClipIds,
  playheadPosition,
  duration,
  voiceover = "",
  audioUrl,
  onClipSelect,
  onReorder,
  onPlayheadChange,
  onSplit,
  onDelete,
  onDuplicate,
  onToggleDisabled,
  onAddClip,
  className,
}: ClipTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDraggingScrub, setIsDraggingScrub] = useState(false);
  const [isDndActive, setIsDndActive] = useState(false);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1); // 1 = default, 2 = 2x zoom, etc.

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = () => setIsDndActive(true);

  const handleDragEnd = (event: DragEndEvent) => {
    setIsDndActive(false);
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = clips.findIndex((c) => c.id === active.id);
      const newIndex = clips.findIndex((c) => c.id === over.id);
      onReorder(oldIndex, newIndex);
    }
  };

  // Scrubbing
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isDndActive || !timelineRef.current) return;

      const rect = timelineRef.current.getBoundingClientRect();
      const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const timePosition = position * duration;

      setIsDraggingScrub(true);
      onPlayheadChange(timePosition);
    },
    [isDndActive, duration, onPlayheadChange]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!timelineRef.current) return;

      const rect = timelineRef.current.getBoundingClientRect();
      const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

      if (isDraggingScrub) {
        onPlayheadChange(position * duration);
      }
    },
    [isDraggingScrub, duration, onPlayheadChange]
  );

  const handleMouseUp = useCallback(() => {
    setIsDraggingScrub(false);
  }, []);

  useEffect(() => {
    if (isDraggingScrub) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDraggingScrub, handleMouseMove, handleMouseUp]);

  const handleTimelineHover = (e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    setHoverPosition((e.clientX - rect.left) / rect.width);
  };

  // Calculate playhead percentage
  const playheadPercent = duration > 0 ? (playheadPosition / duration) * 100 : 0;

  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 30); // Assume 30fps
    return `${mins}:${secs.toString().padStart(2, "0")}:${frames.toString().padStart(2, "0")}`;
  };

  const hasSelection = selectedClipIds.size > 0;

  return (
    <div className={cn("bg-[hsl(222_47%_6%)] rounded-lg border border-border/30", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Timeline
          </span>
          <span className="text-xs text-muted-foreground">
            {clips.length} clips • {formatTime(duration)}
          </span>
        </div>

        {/* Editing tools */}
        <div className="flex items-center gap-1">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onSplit}
                  disabled={selectedClipIds.size !== 1}
                >
                  <Scissors className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Split at playhead (B)</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onDelete(false)}
                  disabled={!hasSelection}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Delete (Del/Backspace, Shift for ripple)</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onDuplicate}
                  disabled={selectedClipIds.size !== 1}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Duplicate (D)</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onToggleDisabled}
                  disabled={!hasSelection}
                >
                  <EyeOff className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Disable/Enable clip</p>
              </TooltipContent>
            </Tooltip>

            <div className="w-px h-4 bg-border/50 mx-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onAddClip}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Add new scene</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <span className="text-[10px] font-mono text-muted-foreground w-8 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setZoom(Math.min(4, zoom + 0.25))}
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Waveform */}
      <AudioWaveformDisplay
        voiceover={voiceover}
        audioUrl={audioUrl}
        playheadPercent={playheadPercent}
      />

      {/* Timeline ruler */}
      <div className="px-4 pt-2">
        <div className="flex text-[9px] font-mono text-muted-foreground/60">
          {duration > 0 && Array.from({ length: Math.ceil(duration / 2) + 1 }).map((_, i) => (
            <div
              key={i}
              className="flex-shrink-0"
              style={{ width: `${(2 / Math.max(duration, 0.0001)) * 100}%` }}
            >
              {formatTime(i * 2)}
            </div>
          ))}
        </div>
      </div>

      {/* Track area */}
      <div className="relative px-4 pb-4 pt-1">
        <div
          ref={timelineRef}
          className="relative h-20 cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleTimelineHover}
          onMouseLeave={() => setHoverPosition(null)}
          style={{ minWidth: `${zoom * 100}%` }}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={clips.map((c) => c.id)}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex h-full">
                {clips.map((clip) => (
                  <SortableClip
                    key={clip.id}
                    clip={clip}
                    isSelected={selectedClipIds.has(clip.id)}
                    duration={duration}
                    onClick={(multi) => onClipSelect(clip.id, multi)}
                  />
                ))}

                {clips.length === 0 && (
                  <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                    No clips — click + to add
                  </div>
                )}
              </div>
            </SortableContext>
          </DndContext>

          {/* Playhead */}
          <div
            className={cn(
              "absolute top-0 bottom-0 w-0.5 bg-primary z-20 pointer-events-none",
              "transition-[left] duration-75",
              isDraggingScrub && "shadow-[0_0_15px_hsl(var(--primary)/0.8)]"
            )}
            style={{ left: `${playheadPercent}%` }}
          >
            <div
              className={cn(
                "absolute -top-1 left-1/2 -translate-x-1/2",
                "w-3 h-3 bg-primary rounded-sm rotate-45",
                "shadow-[0_0_10px_hsl(var(--primary)/0.5)]"
              )}
            />
            <div className="absolute inset-0 w-1 bg-primary/50 blur-sm -left-0.5" />
          </div>

          {/* Hover indicator */}
          {hoverPosition !== null && !isDraggingScrub && !isDndActive && (
            <div
              className="absolute top-0 bottom-0 w-px bg-muted-foreground/30 pointer-events-none z-10"
              style={{ left: `${hoverPosition * 100}%` }}
            />
          )}
        </div>

        {/* Timecode display */}
        <div className="flex justify-between mt-2 text-[10px] font-mono">
          <span className="text-muted-foreground">
            Playhead: <span className="text-primary">{formatTime(playheadPosition)}</span>
          </span>
          <span className="text-muted-foreground">
            Duration: {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Keyboard hints */}
      <div className="flex justify-center gap-4 px-4 pb-3 text-[10px] text-muted-foreground">
        <span>
          <kbd className="px-1 py-0.5 bg-secondary/50 rounded text-[9px]">B</kbd> Split
        </span>
        <span>
          <kbd className="px-1 py-0.5 bg-secondary/50 rounded text-[9px]">D</kbd> Duplicate
        </span>
        <span>
          <kbd className="px-1 py-0.5 bg-secondary/50 rounded text-[9px]">Del</kbd> Delete
        </span>
        <span>
          <kbd className="px-1 py-0.5 bg-secondary/50 rounded text-[9px]">⌘A</kbd> Select all
        </span>
      </div>
    </div>
  );
}

interface SortableClipProps {
  clip: Clip;
  isSelected: boolean;
  duration: number;
  onClick: (multi: boolean) => void;
}

function SortableClip({ clip, isSelected, duration, onClick }: SortableClipProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: clip.id });

  // Prevent division by zero
  const safeDuration = Math.max(duration, 0.0001);
  const clipDuration = clip.end - clip.start;
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: `${(clipDuration / safeDuration) * 100}%`,
    minWidth: "80px",
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick(e.shiftKey || e.metaKey || e.ctrlKey);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "h-full rounded mx-0.5 flex-shrink-0",
        "bg-secondary/30 hover:bg-secondary/50",
        "border transition-all duration-150",
        "flex flex-col items-start justify-center p-2",
        "text-left overflow-hidden cursor-pointer",
        isSelected
          ? "border-primary bg-primary/10 shadow-[0_0_10px_hsl(var(--primary)/0.3)]"
          : "border-border/30 hover:border-border/50",
        isDragging && "opacity-50 scale-105 shadow-lg z-50",
        clip.disabled && "opacity-40"
      )}
      onClick={handleClick}
    >
      <div className="flex items-center gap-1 w-full">
        <button
          className="p-0.5 -ml-1 cursor-grab active:cursor-grabbing touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </button>
        <span className="text-[10px] font-mono text-primary">
          {clip.type === "video" ? "V" : clip.type === "audio" ? "A" : "T"}
        </span>
        <span className="text-[9px] font-mono text-muted-foreground ml-auto">
          {(clip.end - clip.start).toFixed(1)}s
        </span>
      </div>
      <span className="text-[11px] text-muted-foreground line-clamp-2 mt-1">
        {clip.prompt || "(no prompt)"}
      </span>
      {clip.disabled && (
        <EyeOff className="absolute top-1 right-1 h-3 w-3 text-muted-foreground" />
      )}
    </div>
  );
}

interface AudioWaveformDisplayProps {
  voiceover: string;
  audioUrl?: string | null;
  playheadPercent: number;
}

function AudioWaveformDisplay({
  voiceover,
  audioUrl,
  playheadPercent,
}: AudioWaveformDisplayProps) {
  const { peaks, duration, isLoading } = useAudioWaveform(audioUrl, voiceover, 80);

  if (peaks.length === 0 && !isLoading) {
    return null;
  }

  const playheadIndex = Math.floor((playheadPercent / 100) * peaks.length);
  const isRealAudio = !!audioUrl && duration > 0;

  return (
    <div className="h-8 px-4 py-1 flex items-center gap-px border-b border-border/20 relative">
      {isRealAudio && (
        <div className="absolute left-2 top-1/2 -translate-y-1/2">
          <Volume2 className="h-3 w-3 text-success/70" />
        </div>
      )}

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-[10px] text-muted-foreground">
            Loading waveform...
          </div>
        </div>
      ) : (
        peaks.map((amplitude, i) => (
          <div
            key={i}
            className={cn(
              "flex-1 rounded-sm transition-colors duration-75",
              i <= playheadIndex
                ? isRealAudio
                  ? "bg-success/70"
                  : "bg-primary/70"
                : "bg-muted-foreground/20"
            )}
            style={{ height: `${amplitude * 100}%` }}
          />
        ))
      )}
    </div>
  );
}
