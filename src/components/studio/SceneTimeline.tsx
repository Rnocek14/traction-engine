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
import { GripVertical, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useAudioWaveform } from "@/hooks/use-audio-waveform";

interface SceneTimelineProps {
  scenePrompts: string[];
  currentSceneIndex: number;
  onSceneSelect: (index: number) => void;
  onSceneReorder: (fromIndex: number, toIndex: number) => void;
  scrubPosition: number;
  onScrubPositionChange?: (position: number) => void;
  voiceover?: string;
  audioUrl?: string | null;
  className?: string;
}

/**
 * Horizontal timeline with draggable scene clips and synthetic waveform.
 * DaVinci Resolve-inspired design with dnd-kit for reordering.
 */
export function SceneTimeline({
  scenePrompts,
  currentSceneIndex,
  onSceneSelect,
  onSceneReorder,
  scrubPosition,
  onScrubPositionChange,
  voiceover = "",
  audioUrl,
  className,
}: SceneTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const [isDndActive, setIsDndActive] = useState(false);

  // Generate stable scene IDs for dnd-kit based on content + original index
  // This prevents drift during reordering by using content hash
  const sceneIds = useMemo(() => {
    return scenePrompts.map((prompt, i) => {
      // Create a stable ID from content hash + position context
      const contentHash = prompt.slice(0, 20).replace(/\s+/g, "_");
      return `scene-${contentHash}-${i}`;
    });
  }, [scenePrompts]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = () => {
    setIsDndActive(true);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setIsDndActive(false);
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sceneIds.indexOf(active.id as string);
      const newIndex = sceneIds.indexOf(over.id as string);
      onSceneReorder(oldIndex, newIndex);
    }
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isDndActive || !timelineRef.current) return;
    setIsDragging(true);

    const rect = timelineRef.current.getBoundingClientRect();
    const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onScrubPositionChange?.(position);
  }, [isDndActive, onScrubPositionChange]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

    if (isDragging) {
      onScrubPositionChange?.(position);
    }
  }, [isDragging, onScrubPositionChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleTimelineHover = (e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    setHoverPosition((e.clientX - rect.left) / rect.width);
  };

  // Calculate which scene the playhead is over
  const sceneWidth = scenePrompts.length > 0 ? 1 / scenePrompts.length : 1;
  const playheadSceneIndex = Math.min(
    Math.floor(scrubPosition / sceneWidth),
    scenePrompts.length - 1
  );

  return (
    <div className={cn("bg-[hsl(222_47%_6%)] rounded-lg border border-border/30", className)}>
      {/* Timeline header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/30">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Timeline
          </span>
          <span className="text-xs text-muted-foreground">
            {scenePrompts.length} scenes
          </span>
        </div>

        {/* Timecode display */}
        <div className="font-mono text-xs text-primary tabular-nums">
          Scene {Math.max(1, playheadSceneIndex + 1)} / {scenePrompts.length || 1}
        </div>
      </div>

      {/* Waveform - uses real audio if available, falls back to synthetic */}
      <AudioWaveformDisplay
        voiceover={voiceover}
        audioUrl={audioUrl}
        scrubPosition={scrubPosition}
      />

      {/* Timeline track area */}
      <div className="relative p-4 pt-2">
        {/* Time markers */}
        <div className="flex justify-between mb-2 text-[10px] font-mono text-muted-foreground">
          {scenePrompts.map((_, i) => (
            <span key={i} className="w-full text-center">
              {i + 1}
            </span>
          ))}
        </div>

        {/* Track with draggable scenes */}
        <div
          ref={timelineRef}
          className="relative h-20 cursor-pointer"
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
            <SortableContext items={sceneIds} strategy={horizontalListSortingStrategy}>
              <div className="flex gap-1 h-full">
                {scenePrompts.map((prompt, i) => (
                  <SortableSceneClip
                    key={sceneIds[i]}
                    id={sceneIds[i]}
                    index={i}
                    prompt={prompt}
                    isSelected={i === currentSceneIndex}
                    onClick={() => onSceneSelect(i)}
                  />
                ))}

                {scenePrompts.length === 0 && (
                  <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                    No scenes available
                  </div>
                )}
              </div>
            </SortableContext>
          </DndContext>

          {/* Playhead */}
          <div
            className={cn(
              "absolute top-0 bottom-0 w-0.5 bg-primary z-10 pointer-events-none",
              "transition-all duration-75",
              isDragging && "shadow-[0_0_15px_hsl(var(--primary)/0.8)]"
            )}
            style={{ left: `${scrubPosition * 100}%` }}
          >
            {/* Playhead handle */}
            <div className={cn(
              "absolute -top-1 left-1/2 -translate-x-1/2",
              "w-3 h-3 bg-primary rounded-sm rotate-45",
              "shadow-[0_0_10px_hsl(var(--primary)/0.5)]"
            )} />

            {/* Playhead glow */}
            <div className="absolute inset-0 w-1 bg-primary/50 blur-sm -left-0.5" />
          </div>

          {/* Hover indicator */}
          {hoverPosition !== null && !isDragging && !isDndActive && (
            <div
              className="absolute top-0 bottom-0 w-px bg-muted-foreground/30 pointer-events-none"
              style={{ left: `${hoverPosition * 100}%` }}
            />
          )}
        </div>

        {/* Keyboard hint */}
        <div className="flex justify-center gap-4 mt-3 text-[10px] text-muted-foreground">
          <span><kbd className="px-1 py-0.5 bg-secondary/50 rounded text-[9px]">Space</kbd> Play/Pause</span>
          <span><kbd className="px-1 py-0.5 bg-secondary/50 rounded text-[9px]">←</kbd><kbd className="px-1 py-0.5 bg-secondary/50 rounded text-[9px]">→</kbd> Frame step</span>
          <span><kbd className="px-1 py-0.5 bg-secondary/50 rounded text-[9px]">Drag</kbd> Reorder scenes</span>
        </div>
      </div>
    </div>
  );
}

interface SortableSceneClipProps {
  id: string;
  index: number;
  prompt: string;
  isSelected: boolean;
  onClick: () => void;
}

function SortableSceneClip({ id, index, prompt, isSelected, onClick }: SortableSceneClipProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex-1 min-w-[120px] h-full rounded",
        "bg-secondary/30 hover:bg-secondary/50",
        "border transition-all duration-150",
        "flex flex-col items-start justify-center p-2",
        "text-left overflow-hidden",
        isSelected
          ? "border-primary bg-primary/10 shadow-[0_0_10px_hsl(var(--primary)/0.3)]"
          : "border-border/30 hover:border-border/50",
        isDragging && "opacity-50 scale-105 shadow-lg z-50"
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-1 w-full">
        {/* Drag handle */}
        <button
          className="p-0.5 -ml-1 cursor-grab active:cursor-grabbing touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </button>
        <span className="text-[10px] font-mono text-primary">
          Scene {index + 1}
        </span>
      </div>
      <span className="text-[11px] text-muted-foreground line-clamp-2 mt-1">
        {prompt}
      </span>
    </div>
  );
}

interface AudioWaveformDisplayProps {
  voiceover: string;
  audioUrl?: string | null;
  scrubPosition: number;
}

/**
 * Displays audio waveform - uses real audio data if available, 
 * falls back to synthetic waveform generated from text.
 */
function AudioWaveformDisplay({
  voiceover,
  audioUrl,
  scrubPosition,
}: AudioWaveformDisplayProps) {
  const { peaks, duration, isLoading } = useAudioWaveform(audioUrl, voiceover, 60);

  if (peaks.length === 0 && !isLoading) {
    return null;
  }

  const playheadIndex = Math.floor(scrubPosition * peaks.length);
  const isRealAudio = !!audioUrl && duration > 0;

  return (
    <div className="h-8 px-4 py-1 flex items-center gap-px border-b border-border/20 relative">
      {/* Real audio indicator */}
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
                ? isRealAudio ? "bg-success/70" : "bg-primary/70"
                : "bg-muted-foreground/20"
            )}
            style={{ height: `${amplitude * 100}%` }}
          />
        ))
      )}
    </div>
  );
}
