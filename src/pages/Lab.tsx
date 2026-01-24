import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Beaker } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { LabGeneratePanel, LabResult } from "@/components/lab/LabGeneratePanel";
import { LabPreviewPanel } from "@/components/lab/LabPreviewPanel";
import { getVideoJobStatus } from "@/lib/lab-engines";

/**
 * Video Lab - 2-Column R&D Sandbox
 * 
 * Left: Generate (video/voice controls)
 * Right: Preview (always-visible result + strip)
 */
export default function Lab() {
  const [results, setResults] = useState<LabResult[]>([]);
  const [activeResultId, setActiveResultId] = useState<string | null>(null);

  // Memoize job IDs for polling
  const activeJobIds = useMemo(
    () => results
      .filter(r => r.type === "video" && (r.status === "queued" || r.status === "running"))
      .map(r => r.jobId)
      .filter(Boolean) as string[],
    [results]
  );

  const jobIdsKey = activeJobIds.join(",");

  // Poll for video job status updates
  useQuery({
    queryKey: ["lab-video-jobs", jobIdsKey],
    queryFn: async () => {
      if (activeJobIds.length === 0) return null;

      const updates = await Promise.all(
        activeJobIds.map(async jobId => {
          const status = await getVideoJobStatus(jobId);
          return { jobId, ...status };
        })
      );

      setResults(prev => prev.map(result => {
        if (result.type !== "video" || !result.jobId) return result;
        
        const update = updates.find(u => u.jobId === result.jobId);
        if (!update) return result;

        // Auto-select on completion
        if (update.status === "done" && result.status !== "done" && update.outputUrl) {
          setActiveResultId(result.id);
        }

        return {
          ...result,
          status: update.status,
          progress: update.progress || result.progress,
          outputUrl: update.outputUrl,
          error: update.error,
        };
      }));

      return updates;
    },
    enabled: activeJobIds.length > 0,
    refetchInterval: 3000,
  });

  const handleResultCreated = useCallback((result: LabResult) => {
    setResults(prev => [result, ...prev]);
    setActiveResultId(result.id);
  }, []);

  const handleResultUpdated = useCallback((id: string, updates: Partial<LabResult>) => {
    setResults(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }, []);

  const handleSelectResult = useCallback((id: string) => {
    setActiveResultId(id);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b bg-card/50">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/studio">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Beaker className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Video Lab</h1>
          </div>
          <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded">
            R&D Sandbox
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{results.length} results</span>
        </div>
      </header>

      {/* Main Content - 2 Column Layout */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* Left: Generate Panel */}
          <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
            <div className="h-full overflow-auto p-4 border-r">
              <LabGeneratePanel
                onResultCreated={handleResultCreated}
                onResultUpdated={handleResultUpdated}
              />
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right: Preview Panel */}
          <ResizablePanel defaultSize={65} minSize={40}>
            <LabPreviewPanel
              results={results}
              activeResultId={activeResultId}
              onSelectResult={handleSelectResult}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
