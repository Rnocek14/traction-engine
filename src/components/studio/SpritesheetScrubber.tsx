import { useState, useRef, useCallback } from "react";

interface SpritesheetScrubberProps {
  thumbnailUrl: string;
  spritesheetUrl: string;
  onClick?: () => void;
  className?: string;
  cols?: number; // Number of columns in spritesheet
  rows?: number; // Number of rows in spritesheet
}

/**
 * A hover-scrub preview component using a spritesheet.
 * Shows thumbnail by default, scrubs through spritesheet on hover.
 */
export function SpritesheetScrubber({
  thumbnailUrl,
  spritesheetUrl,
  onClick,
  className = "",
  cols = 10,
  rows = 10,
}: SpritesheetScrubberProps) {
  const [isHovering, setIsHovering] = useState(false);
  const [scrubPosition, setScrubPosition] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalFrames = cols * rows;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      
      // Map percentage to frame index
      const frameIndex = Math.floor(percent * (totalFrames - 1));
      setScrubPosition(frameIndex);
    },
    [totalFrames]
  );

  // Calculate background position for current frame
  const col = scrubPosition % cols;
  const row = Math.floor(scrubPosition / cols);
  const bgPositionX = (col / (cols - 1)) * 100;
  const bgPositionY = (row / (rows - 1)) * 100;

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden cursor-pointer ${className}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onMouseMove={handleMouseMove}
      onClick={onClick}
    >
      {/* Thumbnail (shown when not hovering) */}
      <img
        src={thumbnailUrl}
        alt="Video preview"
        className={`w-full h-full object-cover transition-opacity duration-150 ${
          isHovering ? "opacity-0" : "opacity-100"
        }`}
      />

      {/* Spritesheet (shown when hovering) */}
      {spritesheetUrl && (
        <div
          className={`absolute inset-0 transition-opacity duration-150 ${
            isHovering ? "opacity-100" : "opacity-0"
          }`}
          style={{
            backgroundImage: `url(${spritesheetUrl})`,
            backgroundSize: `${cols * 100}% ${rows * 100}%`,
            backgroundPosition: `${bgPositionX}% ${bgPositionY}%`,
          }}
        />
      )}

      {/* Scrub indicator bar */}
      {isHovering && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-secondary/50">
          <div
            className="h-full bg-primary transition-all duration-75"
            style={{ width: `${(scrubPosition / (totalFrames - 1)) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}