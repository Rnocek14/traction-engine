import { useRef, useState, useCallback, useEffect } from "react";
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
  ZoomIn,
  ZoomOut,
  Film,
  Mic,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
  onClipHover?: (clipId: string | null) => void;
  // Trim operations
  onTrimPreview?: (clipId: string, newStart?: number, newEnd?: number) => void;
  onTrimCommit?: (clipId: string, newStart?: number, newEnd?: number) => void;
  rippleMode?: boolean;
  onToggleRipple?: () => void;
  /** Callback to report discovered audio duration to parent */
  onAudioDurationChange?: (duration: number) => void;
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
  onClipHover,
  onTrimPreview,
  onTrimCommit,
  rippleMode = false,
  onToggleRipple,
  onAudioDurationChange,
  className,
}: ClipTimelineProps) {
  // Track discovered audio duration for unified scaling
  const [audioDuration, setAudioDuration] = useState(0);
  
  // Handle audio duration discovery
  const handleAudioDurationChange = useCallback((newDuration: number) => {
    setAudioDuration(newDuration);
    onAudioDurationChange?.(newDuration);
  }, [onAudioDurationChange]);
  
  // Master timeline duration is the max of video clips or audio
  const masterDuration = Math.max(duration, audioDuration);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDraggingScrub, setIsDraggingScrub] = useState(false);
  const [isDndActive, setIsDndActive] = useState(false);
  const [isTrimming, setIsTrimming] = useState(false);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);

  // Convert pixel delta to time delta
  const pxToTime = useCallback(
    (deltaPx: number) => {
      if (!timelineRef.current) return 0;
      const rect = timelineRef.current.getBoundingClientRect();
      const visibleWidth = rect.width;
      if (visibleWidth <= 0) return 0;
      return (deltaPx / visibleWidth) * duration;
    },
    [duration]
  );

  // Trim pointer handler - called from SortableClip
  const handleTrimPointerDown = useCallback(
    (clip: Clip, edge: "left" | "right", e: React.PointerEvent) => {
      if (!onTrimPreview || !onTrimCommit) return;
      
      e.stopPropagation();
      e.preventDefault();
      setIsTrimming(true);

      const startX = e.clientX;
      const originalStart = clip.start;
      const originalEnd = clip.end;

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dt = pxToTime(dx);

        // Shift key for snapping to 0.5s
        const snap = ev.shiftKey ? 0.5 : 0;
        const applySnap = (v: number) => (snap ? Math.round(v / snap) * snap : v);

        if (edge === "left") {
          const ns = applySnap(originalStart + dt);
          const clamped = Math.min(Math.max(0, ns), originalEnd - 0.1);
          onTrimPreview(clip.id, clamped, undefined);
        } else {
          const ne = applySnap(originalEnd + dt);
          const clamped = Math.max(ne, originalStart + 0.1);
          onTrimPreview(clip.id, undefined, clamped);
        }
      };

      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setIsTrimming(false);

        const dx = ev.clientX - startX;
        const dt = pxToTime(dx);

        const snap = ev.shiftKey ? 0.5 : 0;
        const applySnap = (v: number) => (snap ? Math.round(v / snap) * snap : v);

        if (edge === "left") {
          const ns = applySnap(originalStart + dt);
          const clamped = Math.min(Math.max(0, ns), originalEnd - 0.1);
          onTrimCommit(clip.id, clamped, undefined);
        } else {
          const ne = applySnap(originalEnd + dt);
          const clamped = Math.max(ne, originalStart + 0.1);
          onTrimCommit(clip.id, undefined, clamped);
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [onTrimPreview, onTrimCommit, pxToTime]
  );

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

  // Scrubbing - prevent while trimming - use masterDuration for unified timeline
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isDndActive || isTrimming || !timelineRef.current) return;

      const rect = timelineRef.current.getBoundingClientRect();
      const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const timePosition = position * masterDuration;

      setIsDraggingScrub(true);
      onPlayheadChange(timePosition);
    },
    [isDndActive, isTrimming, masterDuration, onPlayheadChange]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!timelineRef.current) return;

      const rect = timelineRef.current.getBoundingClientRect();
      const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

      if (isDraggingScrub) {
        onPlayheadChange(position * masterDuration);
      }
    },
    [isDraggingScrub, masterDuration, onPlayheadChange]
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

  // Calculate playhead percentage based on master duration for unified positioning
  const playheadPercent = masterDuration > 0 ? (playheadPosition / masterDuration) * 100 : 0;

  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 30);
    return `${mins}:${secs.toString().padStart(2, "0")}:${frames.toString().padStart(2, "0")}`;
  };

  const formatTimeShort = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const hasSelection = selectedClipIds.size > 0;
  const safeDuration = Math.max(duration, 0.0001);
  const safeMasterDuration = Math.max(masterDuration, 0.0001);

  return (
    <div className={cn("bg-[hsl(222_47%_5%)] rounded-lg border border-border/30 overflow-hidden", className)}>
      {/* Compact Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30 bg-[hsl(222_47%_7%)]">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            Timeline
          </span>
          <div className="h-3 w-px bg-border/40" />
          <span className="text-[10px] font-mono text-muted-foreground/80">
            {clips.length} clips • {formatTimeShort(duration)}
          </span>
        </div>

        {/* Editing tools */}
        <div className="flex items-center gap-0.5">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={onSplit}
                  disabled={selectedClipIds.size !== 1}
                >
                  <Scissors className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Split at playhead <kbd className="ml-1 px-1 py-0.5 bg-muted rounded text-[10px]">B</kbd></TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={() => onDelete(false)}
                  disabled={!hasSelection}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Delete <kbd className="ml-1 px-1 py-0.5 bg-muted rounded text-[10px]">Del</kbd></TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={onDuplicate}
                  disabled={selectedClipIds.size !== 1}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Duplicate <kbd className="ml-1 px-1 py-0.5 bg-muted rounded text-[10px]">D</kbd></TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={onToggleDisabled}
                  disabled={!hasSelection}
                >
                  <EyeOff className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Disable clip</TooltipContent>
            </Tooltip>

            <div className="w-px h-4 bg-border/30 mx-1" />

            {/* Ripple mode toggle */}
            {onToggleRipple && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-6 px-2 text-[10px] font-medium",
                      rippleMode 
                        ? "bg-success/20 text-success hover:bg-success/30" 
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={onToggleRipple}
                  >
                    Ripple {rippleMode ? "ON" : "OFF"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {rippleMode ? "Trimming shifts following clips" : "Enable ripple to auto-shift clips"}
                </TooltipContent>
              </Tooltip>
            )}

            <div className="w-px h-4 bg-border/30 mx-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-primary hover:text-primary hover:bg-primary/10"
                  onClick={onAddClip}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Add scene</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
          >
            <ZoomOut className="h-3 w-3 text-muted-foreground" />
          </Button>
          <span className="text-[9px] font-mono text-muted-foreground/70 w-7 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => setZoom(Math.min(4, zoom + 0.25))}
          >
            <ZoomIn className="h-3 w-3 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* Tracks Container */}
      <div className="relative">
        {/* Timeline ruler - use master duration for unified scale */}
        <TimelineRuler duration={safeMasterDuration} zoom={zoom} formatTime={formatTimeShort} />

        {/* Audio Track (A1) */}
        <div className="flex border-b border-border/20">
          <TrackLabel label="A1" icon={<Mic className="h-2.5 w-2.5" />} />
          <div className="flex-1 min-w-0 relative" style={{ minWidth: `${zoom * 100}%` }}>
            <AudioWaveformDisplay
              voiceover={voiceover}
              audioUrl={audioUrl}
              playheadPosition={playheadPosition}
              masterDuration={safeMasterDuration}
              onDurationChange={handleAudioDurationChange}
            />
            {/* Unified playhead for audio track */}
            <div
              className="absolute top-0 bottom-0 w-0.5 z-20 pointer-events-none bg-primary/50"
              style={{ 
                left: `${playheadPercent}%`,
                transition: isDraggingScrub ? 'none' : 'left 50ms ease-out'
              }}
            />
          </div>
        </div>

        {/* Video Track (V1) */}
        <div className="flex">
          <TrackLabel label="V1" icon={<Film className="h-2.5 w-2.5" />} />
          <div className="flex-1 min-w-0 relative" style={{ minWidth: `${zoom * 100}%` }}>
            {/* Video clips container - always 100% width, clips scale to master duration */}
            <div
              ref={timelineRef}
              className="h-[72px] cursor-crosshair w-full"
              onMouseDown={handleMouseDown}
              onMouseMove={handleTimelineHover}
              onMouseLeave={() => setHoverPosition(null)}
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
                  <div className="flex h-full p-1 gap-0.5">
                    {clips.map((clip, index) => (
                      <SortableClip
                        key={clip.id}
                        clip={clip}
                        index={index}
                        isSelected={selectedClipIds.has(clip.id)}
                        duration={safeDuration}
                        onClick={(multi) => onClipSelect(clip.id, multi)}
                        onHover={(hovering) => onClipHover?.(hovering ? clip.id : null)}
                        onTrimPointerDown={onTrimPreview && onTrimCommit 
                          ? (e, edge) => handleTrimPointerDown(clip, edge, e)
                          : undefined
                        }
                      />
                    ))}

                    {clips.length === 0 && (
                      <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                          <Plus className="h-5 w-5 text-muted-foreground/40 mx-auto mb-1" />
                          <p className="text-[11px] text-muted-foreground/60">No clips yet</p>
                          <p className="text-[10px] text-muted-foreground/40">Click + to add a scene</p>
                        </div>
                      </div>
                    )}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            {/* Unified playhead - positioned relative to master duration container */}
            <div
              className={cn(
                "absolute top-0 bottom-0 w-0.5 z-20 pointer-events-none",
                "bg-gradient-to-b from-primary via-primary to-primary/50",
                isDraggingScrub && "shadow-[0_0_20px_hsl(var(--primary)/0.9)]"
              )}
              style={{ 
                left: `${playheadPercent}%`,
                transition: isDraggingScrub ? 'none' : 'left 50ms ease-out'
              }}
            >
              {/* Playhead top handle */}
              <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-3 h-3">
                <div className="w-full h-full bg-primary rounded-sm rotate-45 shadow-[0_0_12px_hsl(var(--primary)/0.7)]" />
              </div>
              {/* Playhead glow */}
              <div className="absolute inset-0 w-2 -left-[3px] bg-primary/30 blur-sm" />
            </div>

            {/* Hover indicator */}
            {hoverPosition !== null && !isDraggingScrub && !isDndActive && (
              <div
                className="absolute top-0 bottom-0 w-px bg-muted-foreground/20 pointer-events-none z-10"
                style={{ left: `${hoverPosition * 100}%` }}
              />
            )}
          </div>
        </div>

        {/* Timecode footer */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/20 bg-[hsl(222_47%_4%)]">
          <span className="text-[10px] font-mono text-muted-foreground/70">
            <span className="text-primary font-semibold">{formatTime(playheadPosition)}</span>
            <span className="mx-2 text-muted-foreground/40">/</span>
            {formatTime(safeMasterDuration)}
          </span>
          {hasSelection && (
            <span className="text-[10px] text-muted-foreground/60">
              {selectedClipIds.size} selected
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* Track Label Component */
function TrackLabel({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <div className="w-8 flex-shrink-0 flex flex-col items-center justify-center py-1 border-r border-border/20 bg-[hsl(222_47%_6%)]">
      <span className="text-muted-foreground/60">{icon}</span>
      <span className="text-[8px] font-mono text-muted-foreground/50 mt-0.5">{label}</span>
    </div>
  );
}

/* Timeline Ruler Component */
function TimelineRuler({ 
  duration, 
  zoom, 
  formatTime 
}: { 
  duration: number; 
  zoom: number; 
  formatTime: (s: number) => string;
}) {
  const interval = duration > 30 ? 5 : duration > 10 ? 2 : 1;
  const marks = [];
  for (let t = 0; t <= duration; t += interval) {
    marks.push(t);
  }

  return (
    <div className="h-5 flex items-end border-b border-border/30 bg-[hsl(222_47%_6%)] pl-8">
      <div className="flex-1 relative h-full" style={{ minWidth: `${zoom * 100}%` }}>
        {marks.map((t) => (
          <div
            key={t}
            className="absolute bottom-0 flex flex-col items-center"
            style={{ left: `${(t / duration) * 100}%` }}
          >
            <span className="text-[10px] font-mono text-muted-foreground/70 -translate-x-1/2">
              {formatTime(t)}
            </span>
            <div className="w-px h-1.5 bg-muted-foreground/30" />
          </div>
        ))}
      </div>
    </div>
  );
}

interface SortableClipProps {
  clip: Clip;
  index: number;
  isSelected: boolean;
  duration: number;
  onClick: (multi: boolean) => void;
  onHover?: (hovering: boolean) => void;
  onTrimPointerDown?: (e: React.PointerEvent, edge: "left" | "right") => void;
}

function SortableClip({ 
  clip, 
  index, 
  isSelected, 
  duration, 
  onClick, 
  onHover,
  onTrimPointerDown,
}: SortableClipProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: clip.id });

  // Safe calculations to prevent division by zero
  const safeDuration = Math.max(duration, 0.0001);
  const clipDuration = Math.max(0.01, clip.end - clip.start);
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: `${(clipDuration / safeDuration) * 100}%`,
    minWidth: "100px",
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick(e.shiftKey || e.metaKey || e.ctrlKey);
  };

  const isVideo = clip.type === "video";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "h-full rounded-md flex-shrink-0 overflow-hidden relative",
        "border-2 transition-all duration-150 cursor-pointer group",
        "flex flex-col",
        // Base gradient based on type
        isVideo 
          ? "bg-gradient-to-b from-[hsl(220_60%_18%)] to-[hsl(220_50%_12%)]"
          : "bg-gradient-to-b from-[hsl(150_40%_18%)] to-[hsl(150_30%_12%)]",
        // Selection and hover states
        isSelected
          ? "border-primary shadow-[0_0_16px_hsl(var(--primary)/0.5),inset_0_1px_0_hsl(var(--primary)/0.3)] scale-[1.02]"
          : "border-transparent hover:border-primary/40",
        isDragging && "opacity-60 scale-105 shadow-2xl z-50",
        clip.disabled && "opacity-40 grayscale"
      )}
      onClick={handleClick}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
    >
      {/* Left trim handle */}
      {onTrimPointerDown && (
        <div
          className={cn(
            "absolute left-0 top-0 bottom-0 w-2 z-10",
            "cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity",
            "bg-gradient-to-r from-primary/40 to-transparent",
            "hover:from-primary/70"
          )}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            onTrimPointerDown(e, "left");
          }}
        />
      )}

      {/* Right trim handle */}
      {onTrimPointerDown && (
        <div
          className={cn(
            "absolute right-0 top-0 bottom-0 w-2 z-10",
            "cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity",
            "bg-gradient-to-l from-primary/40 to-transparent",
            "hover:from-primary/70"
          )}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            onTrimPointerDown(e, "right");
          }}
        />
      )}

      {/* Thumbnail strip - visual indicator at top */}
      <div className={cn(
        "h-4 flex-shrink-0 flex items-center px-1.5 gap-1",
        isVideo 
          ? "bg-gradient-to-r from-primary/20 via-primary/10 to-transparent"
          : "bg-gradient-to-r from-success/20 via-success/10 to-transparent"
      )}>
        <button
          className="p-0.5 cursor-grab active:cursor-grabbing touch-none opacity-60 group-hover:opacity-100 transition-opacity"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-2.5 w-2.5 text-foreground/60" />
        </button>
        <span className={cn(
          "text-[9px] font-bold tracking-wider",
          isVideo ? "text-primary/80" : "text-success/80"
        )}>
          {isVideo ? "V" : "A"}
        </span>
        <span className="text-[9px] font-mono text-muted-foreground/50 ml-auto">
          #{index + 1}
        </span>
      </div>

      {/* Main content area */}
      <div className="flex-1 p-1.5 flex flex-col min-h-0">
        <p className={cn(
          "text-[11px] leading-tight line-clamp-2 flex-1",
          isSelected ? "text-foreground" : "text-foreground/80"
        )}>
          {clip.prompt || "(empty)"}
        </p>
        
        {/* Footer with duration badge and camera direction */}
        <div className="flex items-center justify-between mt-auto pt-1 gap-1">
          {clip.disabled && (
            <EyeOff className="h-2.5 w-2.5 text-muted-foreground/60" />
          )}
          
          {/* Camera direction badge */}
          {clip.camera_direction && (
            <span className="text-[8px] font-medium px-1 py-0.5 rounded bg-accent/30 text-accent-foreground/70 truncate max-w-[50px]">
              {clip.camera_direction.replace("-", " ").replace(/\b\w/g, l => l.toUpperCase()).slice(0, 8)}
            </span>
          )}
          
          <span className={cn(
            "text-[9px] font-mono px-1.5 py-0.5 rounded-full ml-auto",
            isSelected 
              ? "bg-primary/30 text-primary" 
              : "bg-background/30 text-muted-foreground/70"
          )}>
            {clipDuration.toFixed(1)}s
          </span>
        </div>
      </div>
    </div>
  );
}

interface AudioWaveformDisplayProps {
  voiceover: string;
  audioUrl?: string | null;
  /** Playhead position in seconds for audio-relative highlighting */
  playheadPosition: number;
  /** Master timeline duration for proportional scaling */
  masterDuration: number;
  /** Callback to report discovered audio duration */
  onDurationChange?: (duration: number) => void;
}

function AudioWaveformDisplay({
  voiceover,
  audioUrl,
  playheadPosition,
  masterDuration,
  onDurationChange,
}: AudioWaveformDisplayProps) {
  const { peaks, duration, isLoading } = useAudioWaveform(audioUrl, voiceover, 100);

  // Report audio duration when it changes
  useEffect(() => {
    if (duration > 0) {
      onDurationChange?.(duration);
    }
  }, [duration, onDurationChange]);

  if (peaks.length === 0 && !isLoading) {
    return (
      <div className="h-10 flex items-center justify-center">
        <span className="text-[10px] text-muted-foreground/40">No audio</span>
      </div>
    );
  }

  // Calculate peak highlighting based on master timeline (same scale as video)
  // This stretches/compresses the audio highlight to match video timeline
  const audioProgress = masterDuration > 0 ? Math.min(1, playheadPosition / masterDuration) : 0;
  const playheadIndex = Math.floor(audioProgress * peaks.length);
  const isRealAudio = !!audioUrl && duration > 0;

  return (
    <div 
      className="h-10 flex items-center gap-px px-2 relative w-full"
    >
      {isRealAudio && (
        <div className="absolute left-1 top-1/2 -translate-y-1/2 z-10">
          <Volume2 className="h-3 w-3 text-success/60" />
        </div>
      )}

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-[10px] text-muted-foreground/50 animate-pulse">
            Analyzing audio...
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-end h-full ml-4">
          {peaks.map((amplitude, i) => {
            const isPast = i <= playheadIndex;
            const height = Math.max(4, amplitude * 28);
            
            return (
              <div
                key={i}
                className={cn(
                  "flex-1 min-w-0 rounded-sm transition-all duration-100",
                  isPast
                    ? isRealAudio
                      ? "bg-gradient-to-t from-success/60 to-success"
                      : "bg-gradient-to-t from-primary/60 to-primary"
                    : "bg-muted-foreground/20"
                )}
                style={{ height: `${height}px` }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
