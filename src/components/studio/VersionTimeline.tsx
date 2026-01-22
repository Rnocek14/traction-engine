import { formatDistanceToNow } from "date-fns";
import { GitBranch, CheckCircle2, XCircle, AlertTriangle, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ScriptRun } from "@/hooks/use-studio";
import { hasHardBlocks, getStatusInfo } from "@/hooks/use-studio";

interface VersionTimelineProps {
  chain: ScriptRun[];
  currentScriptId: string;
  onSelectVersion: (scriptId: string) => void;
  isLoading?: boolean;
}

export function VersionTimeline({
  chain,
  currentScriptId,
  onSelectVersion,
  isLoading,
}: VersionTimelineProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (chain.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        No version history
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 p-2">
        <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground uppercase tracking-wide">
          <GitBranch className="h-3.5 w-3.5" />
          Version History
        </div>

        <div className="relative">
          {/* Vertical line connecting versions */}
          {chain.length > 1 && (
            <div className="absolute left-[19px] top-6 bottom-6 w-px bg-border" />
          )}

          {chain.map((script, index) => {
            const isSelected = script.id === currentScriptId;
            const isOriginal = index === 0;
            const statusInfo = getStatusInfo(script);
            const isHardBlock = hasHardBlocks(script);

            return (
              <button
                key={script.id}
                onClick={() => onSelectVersion(script.id)}
                className={cn(
                  "w-full text-left p-3 rounded-lg transition-all duration-200 relative",
                  "hover:bg-secondary/50 focus:outline-none focus:ring-2 focus:ring-ring/50",
                  isSelected && "bg-secondary border border-primary/30"
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Status icon */}
                  <div
                    className={cn(
                      "relative z-10 p-1 rounded-full bg-background",
                      isSelected && "ring-2 ring-primary/50"
                    )}
                  >
                    <StatusIcon status={script.status} isHardBlock={isHardBlock} />
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    {/* Version label */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {isOriginal ? "Original" : `Regen #${index}`}
                      </span>
                      {isSelected && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                          Current
                        </Badge>
                      )}
                    </div>

                    {/* Status badge */}
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          statusInfo.variant === "success"
                            ? "default"
                            : statusInfo.variant === "destructive"
                            ? "destructive"
                            : statusInfo.variant === "warning"
                            ? "secondary"
                            : "outline"
                        }
                        className={cn(
                          "text-[10px] px-1.5 py-0 h-4",
                          statusInfo.variant === "success" && "bg-success text-success-foreground",
                          statusInfo.variant === "warning" && "bg-warning/20 text-warning border-warning/30"
                        )}
                      >
                        {statusInfo.label}
                      </Badge>
                    </div>

                    {/* Timestamp */}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(script.created_at), { addSuffix: true })}
                    </div>

                    {/* Override indicator */}
                    {script.qa_override_at && (
                      <div className="text-[10px] text-accent">
                        Overridden by {script.qa_override_by || "unknown"}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}

function StatusIcon({
  status,
  isHardBlock,
}: {
  status: string;
  isHardBlock: boolean;
}) {
  if (isHardBlock) {
    return <XCircle className="h-4 w-4 text-destructive" />;
  }

  switch (status) {
    case "qa_passed":
      return <CheckCircle2 className="h-4 w-4 text-success" />;
    case "qa_failed":
      return <AlertTriangle className="h-4 w-4 text-warning" />;
    case "generating":
      return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
    case "published":
      return <CheckCircle2 className="h-4 w-4 text-primary" />;
    case "rejected":
      return <XCircle className="h-4 w-4 text-destructive" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}
