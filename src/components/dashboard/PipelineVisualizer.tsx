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
} from "lucide-react";

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
  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">Content Pipeline</h3>
          <p className="text-sm text-muted-foreground">
            Today's production queue
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">ETA:</span>
          <span className="font-mono text-primary">2h 34m</span>
        </div>
      </div>

      <div className="relative">
        {/* Connection line */}
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-border -translate-y-1/2 z-0" />
        
        {/* Active flow animation */}
        <div className="absolute top-1/2 left-0 h-0.5 bg-gradient-to-r from-primary via-primary to-transparent -translate-y-1/2 z-0 animate-flow" 
             style={{ width: '60%' }} />

        {/* Steps */}
        <div className="relative z-10 flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex flex-col items-center gap-2">
              <StepIndicator step={step} />
              <span
                className={cn(
                  "text-xs font-medium transition-colors",
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
            </div>
          ))}
        </div>
      </div>

      {/* Current activity */}
      <div className="mt-6 p-3 bg-primary/5 border border-primary/20 rounded-lg">
        <div className="flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-primary animate-spin" />
          <span className="text-sm">
            <span className="text-muted-foreground">Processing:</span>{" "}
            <span className="font-medium">3 Sora video clips for @DigitalFootprint account</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ step }: { step: PipelineStep }) {
  const Icon = step.icon;
  
  const statusClasses = {
    completed: "bg-success text-success-foreground shadow-glow-success",
    active: "bg-primary text-primary-foreground shadow-glow-primary animate-pulse-glow",
    pending: "bg-secondary text-muted-foreground",
    error: "bg-destructive text-destructive-foreground",
  };

  return (
    <div
      className={cn(
        "relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300",
        statusClasses[step.status]
      )}
    >
      {step.status === "completed" ? (
        <CheckCircle className="w-5 h-5" />
      ) : step.status === "active" ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <Icon className="w-5 h-5" />
      )}
    </div>
  );
}
