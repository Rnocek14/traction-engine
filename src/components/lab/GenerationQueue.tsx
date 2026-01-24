import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { LabResult } from "./LabGeneratePanel";

interface GenerationQueueProps {
  results: LabResult[];
  className?: string;
}

export function GenerationQueue({ results, className }: GenerationQueueProps) {
  const activeJobs = results.filter(
    r => r.type === "video" && (r.status === "queued" || r.status === "running")
  );

  if (activeJobs.length === 0) return null;

  const getEngineColor = (engine: string) => {
    const colors: Record<string, string> = {
      sora: "bg-primary/20 text-primary border-primary/30",
      runway: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      luma: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    };
    return colors[engine] || "bg-secondary text-secondary-foreground";
  };

  return (
    <div className={cn("rounded-lg border border-primary/20 bg-primary/5 overflow-hidden", className)}>
      <div className="px-3 py-2 border-b border-primary/20 flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        <span className="text-xs font-medium text-primary">
          Generating ({activeJobs.length})
        </span>
      </div>
      
      <div className="p-2 space-y-2 max-h-[140px] overflow-y-auto">
        {activeJobs.map((job) => (
          <div 
            key={job.id}
            className="flex items-center gap-2 p-2 rounded-md bg-background/50"
          >
            <Badge 
              variant="outline" 
              className={cn("text-[9px] px-1.5 h-5 uppercase", getEngineColor(job.engine))}
            >
              {job.engine}
            </Badge>
            <div className="flex-1 min-w-0">
              <Progress value={job.progress} className="h-1.5" />
            </div>
            <span className="text-[10px] text-muted-foreground font-mono w-8 text-right">
              {job.progress}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
