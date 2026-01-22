import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  FileText,
  Mic,
  Film,
  Scissors,
  Upload,
  CheckCircle,
  Loader2,
  Clock,
  Pause,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PipelineStageDrawer } from "./PipelineStageDrawer";

interface PipelineStep {
  id: string;
  label: string;
  icon: typeof FileText;
  status: "completed" | "active" | "pending" | "error";
  count?: number;
}

const steps: PipelineStep[] = [
  { id: "script", label: "Script Gen", icon: FileText, status: "completed", count: 12 },
  { id: "voice", label: "Voice TTS", icon: Mic, status: "completed", count: 12 },
  { id: "video", label: "Sora Clips", icon: Film, status: "active", count: 8 },
  { id: "assembly", label: "FFmpeg", icon: Scissors, status: "pending", count: 0 },
  { id: "publish", label: "Publish", icon: Upload, status: "pending", count: 0 },
];

export function PipelineVisualizer() {
  const [selectedStage, setSelectedStage] = useState<PipelineStep | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  return (
    <>
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold">Content Pipeline</h3>
            <p className="text-sm text-muted-foreground">
              Today's production queue
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Button 
              variant={isPaused ? "default" : "outline"} 
              size="sm" 
              className="gap-2"
              onClick={() => setIsPaused(!isPaused)}
            >
              {isPaused ? (
                <>
                  <Play className="w-4 h-4" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="w-4 h-4" />
                  Pause All
                </>
              )}
            </Button>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">ETA:</span>
              <span className="font-mono text-primary">2h 34m</span>
            </div>
          </div>
        </div>

        <div className="relative">
          {/* Connection line */}
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-border -translate-y-1/2 z-0" />
          
          {/* Active flow animation */}
          {!isPaused && (
            <div className="absolute top-1/2 left-0 h-0.5 bg-gradient-to-r from-primary via-primary to-transparent -translate-y-1/2 z-0 animate-flow" 
                style={{ width: '60%' }} />
          )}

          {/* Steps */}
          <div className="relative z-10 flex items-center justify-between">
            {steps.map((step) => (
              <button
                key={step.id}
                className="flex flex-col items-center gap-2 group cursor-pointer"
                onClick={() => setSelectedStage(step)}
              >
                <StepIndicator step={step} isPaused={isPaused} />
                <span
                  className={cn(
                    "text-xs font-medium transition-colors group-hover:text-primary",
                    step.status === "active" && "text-primary",
                    step.status === "completed" && "text-success",
                    step.status === "pending" && "text-muted-foreground",
                    step.status === "error" && "text-destructive"
                  )}
                >
                  {step.label}
                </span>
                {step.count !== undefined && step.count > 0 && (
                  <span className="text-xs font-mono text-muted-foreground">
                    {step.count} items
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Current activity */}
        <div className={cn(
          "mt-6 p-3 rounded-lg border",
          isPaused 
            ? "bg-warning/5 border-warning/20" 
            : "bg-primary/5 border-primary/20"
        )}>
          <div className="flex items-center gap-3">
            {isPaused ? (
              <Pause className="w-4 h-4 text-warning" />
            ) : (
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
            )}
            <span className="text-sm">
              {isPaused ? (
                <span className="text-warning font-medium">Pipeline paused</span>
              ) : (
                <>
                  <span className="text-muted-foreground">Processing:</span>{" "}
                  <span className="font-medium">3 Sora video clips for @DigitalFootprint account</span>
                </>
              )}
            </span>
          </div>
        </div>
      </div>

      <PipelineStageDrawer 
        open={!!selectedStage} 
        onOpenChange={(open) => !open && setSelectedStage(null)}
        stage={selectedStage}
      />
    </>
  );
}

function StepIndicator({ step, isPaused }: { step: PipelineStep; isPaused: boolean }) {
  const Icon = step.icon;
  
  const statusClasses = {
    completed: "bg-success text-success-foreground shadow-glow-success",
    active: cn(
      "bg-primary text-primary-foreground",
      !isPaused && "shadow-glow-primary animate-pulse-glow"
    ),
    pending: "bg-secondary text-muted-foreground",
    error: "bg-destructive text-destructive-foreground",
  };

  return (
    <div
      className={cn(
        "relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110",
        statusClasses[step.status]
      )}
    >
      {step.status === "completed" ? (
        <CheckCircle className="w-5 h-5" />
      ) : step.status === "active" && !isPaused ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <Icon className="w-5 h-5" />
      )}
    </div>
  );
}
