/**
 * Pre-generation quality gate
 * Validates style guide, prompts, and camera directions before generation
 */

import { useMemo } from "react";
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Camera, 
  Palette, 
  FileText,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Clip, StyleGuide } from "@/types/timeline-types";
import { analyzePromptQuality, type PromptQualityResult } from "@/lib/prompt-quality";

interface QualityCheck {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  message: string;
  fixable?: boolean;
}

interface QualityGateResult {
  canGenerate: boolean;
  overallScore: number;
  checks: QualityCheck[];
  clipIssues: Array<{
    clipIndex: number;
    clipId: string;
    issues: string[];
    quality: PromptQualityResult;
  }>;
}

/**
 * Analyze clips and style guide for quality issues
 */
export function analyzeQuality(
  clips: Clip[],
  styleGuide?: StyleGuide | null
): QualityGateResult {
  const checks: QualityCheck[] = [];
  const clipIssues: QualityGateResult["clipIssues"] = [];
  
  // Check 1: Style guide has character or location
  const hasCharacter = !!styleGuide?.character?.trim();
  const hasLocation = !!styleGuide?.location?.trim();
  const hasAnyStyleGuide = hasCharacter || hasLocation;
  
  checks.push({
    id: "style-guide",
    label: "Style Guide",
    status: hasCharacter && hasLocation ? "pass" : hasAnyStyleGuide ? "warn" : "fail",
    message: hasCharacter && hasLocation
      ? "Character and location defined"
      : hasAnyStyleGuide
        ? `Missing ${!hasCharacter ? "character" : "location"} description`
        : "No style guide set - videos will lack visual consistency",
    fixable: true,
  });
  
  // Check 2: Cinematography settings
  const hasLens = !!styleGuide?.lens;
  const hasLighting = !!styleGuide?.lighting;
  const hasCinematography = hasLens && hasLighting;
  
  checks.push({
    id: "cinematography",
    label: "Cinematography",
    status: hasCinematography ? "pass" : hasLens || hasLighting ? "warn" : "warn",
    message: hasCinematography
      ? "Lens and lighting configured"
      : "Consider setting lens and lighting for consistent look",
    fixable: true,
  });
  
  // Check 3: Per-clip camera directions
  const clipsWithCamera = clips.filter(c => !!c.camera_direction).length;
  const cameraPercent = clips.length > 0 ? (clipsWithCamera / clips.length) * 100 : 0;
  
  checks.push({
    id: "camera-directions",
    label: "Camera Directions",
    status: cameraPercent >= 80 ? "pass" : cameraPercent >= 50 ? "warn" : "warn",
    message: cameraPercent >= 80
      ? `${clipsWithCamera}/${clips.length} clips have shot types`
      : cameraPercent > 0
        ? `Only ${clipsWithCamera}/${clips.length} clips have shot types set`
        : "No camera directions set - consider adding shot types",
    fixable: true,
  });
  
  // Check 4: Prompt quality per clip
  let poorPrompts = 0;
  let abstractPrompts = 0;
  
  clips.forEach((clip, index) => {
    if (!clip.prompt) {
      clipIssues.push({
        clipIndex: index,
        clipId: clip.id,
        issues: ["Empty prompt"],
        quality: { score: 0, level: "poor" } as PromptQualityResult,
      });
      poorPrompts++;
      return;
    }
    
    const quality = analyzePromptQuality(clip.prompt);
    
    if (quality.level === "poor" || quality.isAbstract) {
      clipIssues.push({
        clipIndex: index,
        clipId: clip.id,
        issues: quality.issues,
        quality,
      });
      
      if (quality.level === "poor") poorPrompts++;
      if (quality.isAbstract) abstractPrompts++;
    }
  });
  
  checks.push({
    id: "prompt-quality",
    label: "Prompt Quality",
    status: poorPrompts === 0 && abstractPrompts === 0 
      ? "pass" 
      : poorPrompts > 0 
        ? "warn" 
        : "warn",
    message: poorPrompts === 0 && abstractPrompts === 0
      ? "All prompts are well-structured"
      : poorPrompts > 0
        ? `${poorPrompts} clip(s) have weak prompts`
        : `${abstractPrompts} clip(s) may be too abstract for video AI`,
    fixable: true,
  });
  
  // Calculate overall score
  const passCount = checks.filter(c => c.status === "pass").length;
  const overallScore = Math.round((passCount / checks.length) * 100);
  
  // Can generate if no hard failures (we allow warnings)
  const canGenerate = !checks.some(c => c.status === "fail") || hasAnyStyleGuide;
  
  return {
    canGenerate,
    overallScore,
    checks,
    clipIssues,
  };
}

interface QualityGateProps {
  clips: Clip[];
  styleGuide?: StyleGuide | null;
  onNavigateToStyleGuide?: () => void;
  onSelectClip?: (clipId: string) => void;
  compact?: boolean;
  className?: string;
}

/**
 * Visual quality gate component
 */
export function QualityGate({
  clips,
  styleGuide,
  onNavigateToStyleGuide,
  onSelectClip,
  compact = false,
  className,
}: QualityGateProps) {
  const result = useMemo(
    () => analyzeQuality(clips, styleGuide),
    [clips, styleGuide]
  );
  
  if (compact) {
    // Compact inline indicator
    const hasIssues = result.checks.some(c => c.status !== "pass");
    
    if (!hasIssues) {
      return (
        <span className="inline-flex items-center gap-1 text-success text-[10px]">
          <CheckCircle2 className="h-3 w-3" />
          Ready
        </span>
      );
    }
    
    const warnCount = result.checks.filter(c => c.status === "warn").length;
    const failCount = result.checks.filter(c => c.status === "fail").length;
    
    return (
      <span className={cn(
        "inline-flex items-center gap-1 text-[10px]",
        failCount > 0 ? "text-destructive" : "text-warning"
      )}>
        <AlertTriangle className="h-3 w-3" />
        {failCount > 0 ? `${failCount} issue${failCount > 1 ? "s" : ""}` : `${warnCount} warning${warnCount > 1 ? "s" : ""}`}
      </span>
    );
  }
  
  return (
    <div className={cn("space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Sparkles className="h-3 w-3" />
          Quality Gate
        </span>
        <Badge 
          variant="outline"
          className={cn(
            "text-[10px] font-mono",
            result.overallScore >= 80 
              ? "border-success text-success" 
              : result.overallScore >= 50
                ? "border-warning text-warning"
                : "border-destructive text-destructive"
          )}
        >
          {result.overallScore}%
        </Badge>
      </div>
      
      {/* Checks */}
      <div className="space-y-1.5">
        {result.checks.map((check) => {
          const Icon = check.status === "pass" 
            ? CheckCircle2 
            : check.status === "warn" 
              ? AlertTriangle 
              : XCircle;
          
          const iconColor = check.status === "pass"
            ? "text-success"
            : check.status === "warn"
              ? "text-warning"
              : "text-destructive";
          
          const CategoryIcon = check.id === "style-guide"
            ? Palette
            : check.id === "cinematography"
              ? Camera
              : check.id === "camera-directions"
                ? Camera
                : FileText;
          
          return (
            <div
              key={check.id}
              className={cn(
                "flex items-start gap-2 p-2 rounded text-xs",
                check.status === "pass"
                  ? "bg-success/5"
                  : check.status === "warn"
                    ? "bg-warning/5"
                    : "bg-destructive/5"
              )}
            >
              <Icon className={cn("h-3.5 w-3.5 mt-0.5 flex-shrink-0", iconColor)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <CategoryIcon className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">{check.label}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {check.message}
                </p>
              </div>
              {check.fixable && check.status !== "pass" && check.id === "style-guide" && onNavigateToStyleGuide && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={onNavigateToStyleGuide}
                >
                  Fix
                </Button>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Clip issues */}
      {result.clipIssues.length > 0 && (
        <div className="border-t border-border/30 pt-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
            Clip Issues
          </p>
          <div className="space-y-1">
            {result.clipIssues.slice(0, 3).map((issue) => (
              <button
                key={issue.clipId}
                onClick={() => onSelectClip?.(issue.clipId)}
                className={cn(
                  "w-full text-left p-1.5 rounded text-[10px]",
                  "bg-warning/5 hover:bg-warning/10 transition-colors",
                  "flex items-center gap-2"
                )}
              >
                <span className="font-mono text-warning">
                  #{issue.clipIndex + 1}
                </span>
                <span className="text-muted-foreground truncate flex-1">
                  {issue.issues[0]}
                </span>
              </button>
            ))}
            {result.clipIssues.length > 3 && (
              <p className="text-[10px] text-muted-foreground pl-1.5">
                +{result.clipIssues.length - 3} more issues
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
