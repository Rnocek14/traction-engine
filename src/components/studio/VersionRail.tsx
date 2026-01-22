import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  Send,
  Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getStatusInfo, hasHardBlocks } from "@/hooks/use-studio";
import type { Tables } from "@/integrations/supabase/types";

type ScriptRun = Tables<"script_runs">;

interface VersionRailProps {
  chain: ScriptRun[];
  currentScriptId: string;
  onSelectVersion: (scriptId: string) => void;
  isLoading: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

/**
 * Collapsible left rail showing version history.
 * Icon-only mode when collapsed, full details when expanded.
 */
export function VersionRail({
  chain,
  currentScriptId,
  onSelectVersion,
  isLoading,
  isCollapsed,
  onToggleCollapse,
}: VersionRailProps) {
  return (
    <div
      className={cn(
        "flex flex-col bg-[hsl(222_47%_6%)] border-r border-border/30",
        "transition-all duration-200",
        isCollapsed ? "w-14" : "w-56"
      )}
    >
      {/* Header with toggle */}
      <div className="flex items-center justify-between p-2 border-b border-border/30">
        {!isCollapsed && (
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2">
            Versions
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={onToggleCollapse}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Version list */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : chain.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No version history
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {chain.map((script, index) => {
              const isSelected = script.id === currentScriptId;
              const isHardBlock = hasHardBlocks(script);
              const statusInfo = getStatusInfo(script);

              return (
                <TooltipProvider key={script.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => onSelectVersion(script.id)}
                        className={cn(
                          "w-full flex items-center gap-2 p-2 rounded",
                          "transition-all duration-150",
                          "hover:bg-secondary/50",
                          isSelected && "bg-primary/10 border border-primary/30"
                        )}
                      >
                        <StatusIcon status={script.status} isHardBlock={isHardBlock} />
                        
                        {!isCollapsed && (
                          <div className="flex-1 min-w-0 text-left">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-mono text-muted-foreground">
                                v{chain.length - index}
                              </span>
                              {isHardBlock && (
                                <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {formatDistanceToNow(new Date(script.created_at), { addSuffix: true })}
                            </p>
                          </div>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      <div className="space-y-1">
                        <p className="font-medium text-xs">{statusInfo.label}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(script.created_at), { addSuffix: true })}
                        </p>
                        <p className="text-[10px] font-mono text-muted-foreground">
                          {script.id.slice(0, 8)}...
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Keyboard hint */}
      {!isCollapsed && (
        <div className="p-2 border-t border-border/30">
          <p className="text-[10px] text-muted-foreground text-center">
            <kbd className="px-1 py-0.5 bg-secondary/50 rounded text-[9px]">V</kbd> toggle rail
          </p>
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status, isHardBlock }: { status: string; isHardBlock: boolean }) {
  if (isHardBlock) {
    return <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />;
  }

  switch (status) {
    case "qa_passed":
      return <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />;
    case "qa_failed":
      return <XCircle className="h-4 w-4 text-warning flex-shrink-0" />;
    case "generating":
      return <Loader2 className="h-4 w-4 text-primary animate-spin flex-shrink-0" />;
    case "published":
      return <Send className="h-4 w-4 text-success flex-shrink-0" />;
    case "rejected":
      return <Ban className="h-4 w-4 text-destructive flex-shrink-0" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />;
  }
}
