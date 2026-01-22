import { useRef, useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

interface SceneTimelineProps {
  scenePrompts: string[];
  currentSceneIndex: number;
  onSceneSelect: (index: number) => void;
  scrubPosition: number; // 0-1 representing video progress
  onScrubPositionChange?: (position: number) => void;
  className?: string;
}

/**
 * Horizontal timeline with scene clips and draggable playhead.
 * DaVinci Resolve-inspired design.
 */
export function SceneTimeline({
  scenePrompts,
  currentSceneIndex,
  onSceneSelect,
  scrubPosition,
  onScrubPositionChange,
  className,
}: SceneTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    setIsDragging(true);
    
    const rect = timelineRef.current.getBoundingClientRect();
    const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onScrubPositionChange?.(position);
  }, [onScrubPositionChange]);

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
          Scene {playheadSceneIndex + 1} / {scenePrompts.length}
        </div>
      </div>

      {/* Timeline track area */}
      <div className="relative p-4">
        {/* Time markers */}
        <div className="flex justify-between mb-2 text-[10px] font-mono text-muted-foreground">
          {scenePrompts.map((_, i) => (
            <span key={i} className="w-full text-center">
              {i + 1}
            </span>
          ))}
        </div>

        {/* Track with playhead */}
        <div
          ref={timelineRef}
          className="relative h-20 cursor-pointer"
          onMouseDown={handleMouseDown}
          onMouseMove={handleTimelineHover}
          onMouseLeave={() => setHoverPosition(null)}
        >
          {/* Scene clips */}
          <ScrollArea className="h-full w-full">
            <div className="flex gap-1 h-full pr-4">
              {scenePrompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => onSceneSelect(i)}
                  className={cn(
                    "flex-1 min-w-[120px] h-full rounded",
                    "bg-secondary/30 hover:bg-secondary/50",
                    "border transition-all duration-150",
                    "flex flex-col items-start justify-center p-2",
                    "text-left overflow-hidden",
                    i === currentSceneIndex
                      ? "border-primary bg-primary/10 shadow-[0_0_10px_hsl(var(--primary)/0.3)]"
                      : "border-border/30 hover:border-border/50"
                  )}
                >
                  <span className="text-[10px] font-mono text-primary mb-1">
                    Scene {i + 1}
                  </span>
                  <span className="text-[11px] text-muted-foreground line-clamp-2">
                    {prompt}
                  </span>
                </button>
              ))}

              {scenePrompts.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                  No scenes available
                </div>
              )}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          {/* Playhead */}
          <div
            className={cn(
              "absolute top-0 bottom-0 w-0.5 bg-primary z-10",
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
            
            {/* Playhead glow when playing */}
            <div className={cn(
              "absolute inset-0 w-1 bg-primary/50 blur-sm",
              "-left-0.5"
            )} />
          </div>

          {/* Hover indicator */}
          {hoverPosition !== null && !isDragging && (
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
          <span><kbd className="px-1 py-0.5 bg-secondary/50 rounded text-[9px]">M</kbd> Mute</span>
        </div>
      </div>
    </div>
  );
}
