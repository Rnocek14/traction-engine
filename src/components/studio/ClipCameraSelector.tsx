/**
 * Per-clip camera direction selector
 * Allows setting shot type for individual clips
 */

import { Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SHOT_TYPE_OPTIONS } from "@/types/timeline-types";

interface ClipCameraSelectorProps {
  value?: string;
  onChange: (value: string) => void;
  compact?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Dropdown for selecting camera direction/shot type per clip
 */
export function ClipCameraSelector({
  value,
  onChange,
  compact = false,
  disabled = false,
  className,
}: ClipCameraSelectorProps) {
  // Find current selection info
  const currentShot = SHOT_TYPE_OPTIONS.find(s => s.value === value);
  
  if (compact) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Select value={value || ""} onValueChange={onChange} disabled={disabled}>
              <SelectTrigger 
                className={cn(
                  "h-6 w-6 p-0 border-0 bg-transparent hover:bg-secondary/50 justify-center",
                  value ? "text-primary" : "text-muted-foreground",
                  className
                )}
              >
                <Camera className="h-3 w-3" />
              </SelectTrigger>
              <SelectContent align="end" className="w-64">
                <SelectItem value="">
                  <span className="text-muted-foreground">No camera direction (use style guide)</span>
                </SelectItem>
                {SHOT_TYPE_OPTIONS.map((shot) => (
                  <SelectItem key={shot.value} value={shot.value}>
                    <div className="flex flex-col">
                      <span className="font-medium">{shot.label}</span>
                      <span className="text-[10px] text-muted-foreground">{shot.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-[200px]">
            {currentShot ? (
              <div>
                <div className="font-medium">{currentShot.label}</div>
                <div className="text-muted-foreground text-xs">{currentShot.description}</div>
              </div>
            ) : (
              <span>Set camera direction for this clip</span>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  return (
    <Select value={value || ""} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={cn("h-8 text-xs", className)}>
        <div className="flex items-center gap-2">
          <Camera className="h-3 w-3" />
          <SelectValue placeholder="Camera direction..." />
        </div>
      </SelectTrigger>
      <SelectContent className="w-72">
        <SelectItem value="">
          <span className="text-muted-foreground">No override (use style guide)</span>
        </SelectItem>
        {SHOT_TYPE_OPTIONS.map((shot) => (
          <SelectItem key={shot.value} value={shot.value}>
            <div className="flex flex-col py-0.5">
              <span className="font-medium text-xs">{shot.label}</span>
              <span className="text-[10px] text-muted-foreground">{shot.description}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
