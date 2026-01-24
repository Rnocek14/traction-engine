import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Beaker, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { LabGeneratePanel, LabResult } from "@/components/lab/LabGeneratePanel";
import { LabPreviewPanel } from "@/components/lab/LabPreviewPanel";
import { LearningInspector } from "@/components/lab/LearningInspector";
import { getVideoJobStatus } from "@/lib/lab-engines";
import { supabase } from "@/integrations/supabase/client";

/**
 * Video Lab - 2-Column R&D Sandbox
 * 
 * Left: Generate (video/voice controls)
 * Right: Preview (always-visible result + strip)
 */
export default function Lab() {
  const [results, setResults] = useState<LabResult[]>([]);
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const [extendHandler, setExtendHandler] = useState<((sourceUrl: string, engine: import("@/lib/lab-engines").VideoEngine) => void) | null>(null);

  // Memoize job IDs for polling - include jobs missing providerGenerationId
  const activeJobIds = useMemo(
    () => results
      .filter(r => r.type === "video" && (r.status === "queued" || r.status === "running"))
      .map(r => r.jobId)
      .filter(Boolean) as string[],
    [results]
  );

  // Jobs that are done but missing providerGenerationId (need one-time fetch)
  const jobsMissingGenId = useMemo(
    () => results
      .filter(r => r.type === "video" && r.status === "done" && r.engine === "luma" && !r.providerGenerationId && r.jobId)
      .map(r => r.jobId) as string[],
    [results]
  );

  const jobIdsKey = activeJobIds.join(",");
  const hasActiveJobs = activeJobIds.length > 0;

  // Trigger provider polling when we have active jobs
  useEffect(() => {
    if (!hasActiveJobs) return;

    // Immediately trigger processing
    const triggerProcessing = async () => {
      // Call each processor for their respective jobs
      const providers = new Set(
        results
          .filter(r => r.type === "video" && (r.status === "queued" || r.status === "running"))
          .map(r => r.engine)
      );

      const processCalls = [];
      
      if (providers.has("sora")) {
        processCalls.push(supabase.functions.invoke("process-video", { body: {} }));
      }
      if (providers.has("runway")) {
        processCalls.push(supabase.functions.invoke("process-video-runway", { body: {} }));
      }
      if (providers.has("luma")) {
        processCalls.push(supabase.functions.invoke("process-video-luma", { body: {} }));
      }

      await Promise.allSettled(processCalls);
    };

    triggerProcessing();

    // Poll every 5 seconds
    const interval = setInterval(triggerProcessing, 5000);
    return () => clearInterval(interval);
  }, [hasActiveJobs, results]);

  // Poll for video job status updates from database
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
          providerGenerationId: update.providerGenerationId || result.providerGenerationId,
        };
      }));

      return updates;
    },
    enabled: activeJobIds.length > 0,
    refetchInterval: 3000,
  });

  // One-time fetch for completed Luma jobs missing providerGenerationId
  useEffect(() => {
    if (jobsMissingGenId.length === 0) return;

    const fetchMissingGenIds = async () => {
      const updates = await Promise.all(
        jobsMissingGenId.map(async jobId => {
          const status = await getVideoJobStatus(jobId);
          return { jobId, providerGenerationId: status.providerGenerationId };
        })
      );

      setResults(prev => prev.map(result => {
        if (result.type !== "video" || !result.jobId) return result;
        const update = updates.find(u => u.jobId === result.jobId);
        if (!update?.providerGenerationId) return result;
        return { ...result, providerGenerationId: update.providerGenerationId };
      }));
    };

    fetchMissingGenIds();
  }, [jobsMissingGenId.join(",")]);

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

      {/* Main Content - Tabs for Generate vs Learning */}
      <Tabs defaultValue="generate" className="flex-1 min-h-0 flex flex-col">
        <div className="px-4 pt-2 border-b bg-card/30">
          <TabsList className="h-9">
            <TabsTrigger value="generate" className="gap-2">
              <Beaker className="h-4 w-4" />
              Generate
            </TabsTrigger>
            <TabsTrigger value="learning" className="gap-2">
              <Brain className="h-4 w-4" />
              Learning Inspector
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="generate" className="flex-1 min-h-0 m-0">
          <ResizablePanelGroup direction="horizontal" className="h-full">
            {/* Left: Generate Panel */}
            <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
              <div className="h-full overflow-y-auto overflow-x-hidden p-4 border-r border-border">
                <LabGeneratePanel
                  results={results}
                  onResultCreated={handleResultCreated}
                  onResultUpdated={handleResultUpdated}
                  onExtendReady={(handler) => setExtendHandler(() => handler)}
                />
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle className="bg-border/50 hover:bg-primary/20 transition-colors" />

            {/* Right: Preview Panel */}
            <ResizablePanel defaultSize={65} minSize={40}>
              <div className="h-full overflow-hidden">
                <LabPreviewPanel
                  results={results}
                  activeResultId={activeResultId}
                  onSelectResult={handleSelectResult}
                  onExtendVideo={extendHandler || undefined}
                />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </TabsContent>

        <TabsContent value="learning" className="flex-1 min-h-0 m-0">
          <LearningInspector />
        </TabsContent>
      </Tabs>
    </div>
  );
}
