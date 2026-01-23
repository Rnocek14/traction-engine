/**
 * Visual indicator for prompt quality
 * Shows quality score and issues as a compact badge
 */

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Sparkles, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  analyzePromptQuality,
  getQualityColor,
  getQualityBgColor,
  type PromptQualityResult,
} from "@/lib/prompt-quality";

interface PromptQualityBadgeProps {
  prompt: string;
  showScore?: boolean;
  compact?: boolean;
  className?: string;
}

/**
 * Badge showing prompt quality analysis
 */
export function PromptQualityBadge({
  prompt,
  showScore = false,
  compact = true,
  className,
}: PromptQualityBadgeProps) {
  const quality = useMemo(() => analyzePromptQuality(prompt), [prompt]);
  
  // Don't show badge for excellent prompts (reduce noise)
  if (quality.level === "excellent" && !showScore) {
    return null;
  }
  
  const Icon = quality.level === "excellent" 
    ? CheckCircle2 
    : quality.level === "good"
      ? Sparkles
      : quality.level === "fair"
        ? Info
        : AlertTriangle;
  
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5",
              getQualityBgColor(quality.level),
              getQualityColor(quality.level),
              compact ? "text-[9px]" : "text-xs",
              className
            )}
          >
            <Icon className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
            {showScore && <span className="font-mono">{quality.score}</span>}
            {!compact && (
              <span className="capitalize font-medium">{quality.level}</span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[280px]">
          <QualityTooltipContent quality={quality} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function QualityTooltipContent({ quality }: { quality: PromptQualityResult }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <span className="font-medium capitalize">{quality.level} Prompt</span>
        <span className={cn("font-mono text-sm", getQualityColor(quality.level))}>
          {quality.score}/100
        </span>
      </div>
      
      {/* Indicators */}
      <div className="flex flex-wrap gap-2 text-[10px]">
        <span className={quality.hasSubject ? "text-success" : "text-muted-foreground"}>
          {quality.hasSubject ? "✓" : "✗"} Subject
        </span>
        <span className={quality.hasAction ? "text-success" : "text-muted-foreground"}>
          {quality.hasAction ? "✓" : "✗"} Action
        </span>
        <span className={quality.hasContext ? "text-success" : "text-muted-foreground"}>
          {quality.hasContext ? "✓" : "✗"} Context
        </span>
        {quality.isAbstract && (
          <span className="text-destructive">⚠ Abstract</span>
        )}
      </div>
      
      {/* Issues */}
      {quality.issues.length > 0 && (
        <div className="text-[10px] text-muted-foreground border-t border-border/30 pt-1">
          <div className="font-medium text-destructive mb-0.5">Issues:</div>
          <ul className="space-y-0.5">
            {quality.issues.slice(0, 3).map((issue, i) => (
              <li key={i} className="text-destructive/80">• {issue}</li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Suggestions */}
      {quality.suggestions.length > 0 && (
        <div className="text-[10px] text-muted-foreground border-t border-border/30 pt-1">
          <div className="font-medium text-primary mb-0.5">Suggestions:</div>
          <ul className="space-y-0.5">
            {quality.suggestions.slice(0, 2).map((suggestion, i) => (
              <li key={i} className="text-primary/80">→ {suggestion}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Inline quality indicator for use in compact spaces
 */
export function PromptQualityDot({
  prompt,
  className,
}: {
  prompt: string;
  className?: string;
}) {
  const quality = useMemo(() => analyzePromptQuality(prompt), [prompt]);
  
  // Only show for fair/poor quality
  if (quality.level === "excellent" || quality.level === "good") {
    return null;
  }
  
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-block w-2 h-2 rounded-full",
              quality.level === "fair" ? "bg-warning" : "bg-destructive",
              quality.level === "poor" && "animate-pulse",
              className
            )}
          />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[280px]">
          <QualityTooltipContent quality={quality} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
