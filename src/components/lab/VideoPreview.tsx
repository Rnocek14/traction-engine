import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoPreviewProps {
  url: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
}

/**
 * Video preview component with fallback for CORS/playback issues
 */
export function VideoPreview({
  url,
  poster,
  className,
  autoPlay = true,
}: VideoPreviewProps) {
  const [failed, setFailed] = useState(false);

  if (!url) return null;

  if (failed) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full gap-2 p-4 bg-secondary/20 rounded-lg", className)}>
        <p className="text-xs text-muted-foreground text-center">
          Preview failed to load in-browser
        </p>
        <p className="text-[10px] text-muted-foreground/70 break-all max-w-full px-2">
          {url.slice(0, 60)}...
        </p>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => window.open(url, "_blank")}
        >
          <ExternalLink className="h-3 w-3 mr-1" />
          Open in new tab
        </Button>
      </div>
    );
  }

  return (
    <video
      src={url}
      poster={poster}
      controls
      autoPlay={autoPlay}
      muted
      playsInline
      loop
      className={cn("w-full h-full object-contain bg-black rounded-lg", className)}
      onError={() => setFailed(true)}
    />
  );
}
