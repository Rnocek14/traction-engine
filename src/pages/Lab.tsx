import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Beaker, Brain, Scale, BarChart3, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { LabGeneratePanel, LabResult } from "@/components/lab/LabGeneratePanel";
import { LabPreviewPanel } from "@/components/lab/LabPreviewPanel";
import { LearningInspector } from "@/components/lab/LearningInspector";
import { ComparePanel } from "@/components/lab/ComparePanel";
import { StoryBuilderPanel } from "@/components/lab/StoryBuilderPanel";
import { StoryLibrary } from "@/components/lab/StoryLibrary";
import { getVideoJobStatus } from "@/lib/lab-engines";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "lab-results";

/** Load results from sessionStorage */
function loadStoredResults(): LabResult[] {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as LabResult[];
      // Restore startTime as Date-compatible number
      return parsed.map(r => ({ ...r, startTime: r.startTime || Date.now() }));
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

/** Save results to sessionStorage */
function saveResults(results: LabResult[]) {
  try {
    // Only keep last 50 results to avoid storage limits
    const toStore = results.slice(0, 50);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Video Lab - 2-Column R&D Sandbox
 * 
 * Left: Generate (video/voice controls)
 * Right: Preview (always-visible result + strip)
 */
export default function Lab() {
  const { storyId } = useParams<{ storyId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // Check if we're in "new story" mode (navigated to /studio/lab/story?new=true)
  const forceNewStory = searchParams.get("new") === "true";
  
  // Initialize from sessionStorage to persist across tab switches
  const [results, setResults] = useState<LabResult[]>(() => loadStoredResults());
  const [activeResultId, setActiveResultId] = useState<string | null>(() => {
    const stored = loadStoredResults();
    return stored.length > 0 ? stored[0].id : null;
  });
  const [extendHandler, setExtendHandler] = useState<((sourceUrl: string, engine: import("@/lib/lab-engines").VideoEngine) => void) | null>(null);
  
  // Quick-compare state
  const [compareJobIdA, setCompareJobIdA] = useState<string | null>(null);
  const [compareJobIdB, setCompareJobIdB] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>(() => (storyId || forceNewStory) ? "story" : "generate");
  
  // Track if we've done initial hydration
  const isHydrated = useRef(false);

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
    isHydrated.current = true;

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

  // Persist results to sessionStorage whenever they change
  useEffect(() => {
    if (results.length > 0 || isHydrated.current) {
      saveResults(results);
    }
  }, [results]);

  const handleResultCreated = useCallback((result: LabResult) => {
    setResults(prev => {
      const updated = [result, ...prev];
      saveResults(updated); // Immediate save for new results
      return updated;
    });
    setActiveResultId(result.id);
  }, []);

  const handleResultUpdated = useCallback((id: string, updates: Partial<LabResult>) => {
    setResults(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }, []);

  const handleSelectResult = useCallback((id: string) => {
    setActiveResultId(id);
  }, []);

  // Count active jobs for header badge
  const activeJobCount = results.filter(
    r => r.type === "video" && (r.status === "queued" || r.status === "running")
  ).length;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Compact Header */}
      <header className="flex items-center justify-between px-4 py-1.5 border-b bg-card/50">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link to="/studio">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Beaker className="h-4 w-4 text-primary" />
            <h1 className="text-sm font-semibold">Video Lab</h1>
          </div>
          <Badge variant="secondary" className="text-[10px] h-5">
            R&D Sandbox
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          {activeJobCount > 0 && (
            <Badge variant="default" className="text-[10px] h-5 bg-primary/80">
              {activeJobCount} generating
            </Badge>
          )}
          <span className="text-[11px] text-muted-foreground">
            {results.filter(r => r.type === "video").length} videos
          </span>
        </div>
      </header>

      {/* Main Content - Tabs for Generate vs Learning vs Compare */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
        <div className="px-4 py-1.5 border-b bg-card/30 flex items-center justify-between">
          <TabsList className="h-8">
            <TabsTrigger value="generate" className="gap-1.5 text-xs h-7">
              <Beaker className="h-3.5 w-3.5" />
              Generate
            </TabsTrigger>
            <TabsTrigger value="story" className="gap-1.5 text-xs h-7">
              <Film className="h-3.5 w-3.5" />
              Story
            </TabsTrigger>
            <TabsTrigger value="compare" className="gap-1.5 text-xs h-7">
              <Scale className="h-3.5 w-3.5" />
              Compare
            </TabsTrigger>
            <TabsTrigger value="learning" className="gap-1.5 text-xs h-7">
              <Brain className="h-3.5 w-3.5" />
              Learning
            </TabsTrigger>
          </TabsList>
          
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" asChild>
            <Link to="/studio/analytics">
              <BarChart3 className="h-3.5 w-3.5" />
              Analytics
            </Link>
          </Button>
        </div>

        <TabsContent value="generate" className="flex-1 min-h-0 m-0 h-full">
          <ResizablePanelGroup direction="horizontal" className="h-full w-full">
            {/* Left: Generate Panel - narrower */}
            <ResizablePanel defaultSize={30} minSize={22} maxSize={45}>
              <div className="h-full overflow-y-auto overflow-x-hidden p-3 border-r border-border">
                <LabGeneratePanel
                  results={results}
                  onResultCreated={handleResultCreated}
                  onResultUpdated={handleResultUpdated}
                  onExtendReady={(handler) => setExtendHandler(() => handler)}
                />
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle className="bg-border/50 hover:bg-primary/20 transition-colors" />

            {/* Right: Preview with integrated filmstrip */}
            <ResizablePanel defaultSize={70} minSize={45} className="h-full">
              <LabPreviewPanel
                results={results}
                activeResultId={activeResultId}
                onSelectResult={handleSelectResult}
                onAddResult={handleResultCreated}
                onExtendVideo={extendHandler || undefined}
                compareJobIdA={compareJobIdA}
                compareJobIdB={compareJobIdB}
                onSetCompareA={setCompareJobIdA}
                onSetCompareB={setCompareJobIdB}
                onGoToCompare={() => setActiveTab("compare")}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </TabsContent>

        <TabsContent value="story" className="flex-1 min-h-0 m-0 flex">
          {/* Story Library sidebar */}
          <div className="w-72 border-r border-border/50 overflow-y-auto p-2">
            <StoryLibrary
              activeStoryId={storyId}
              onSelectStory={(id) => navigate(`/studio/lab/story/${id}`)}
            />
          </div>
          
          {/* Story Builder main panel */}
          <div className="flex-1 overflow-y-auto">
            <StoryBuilderPanel
              storyId={storyId}
              forceNew={forceNewStory && !storyId}
              onStoryCreated={(newStoryId) => navigate(`/studio/lab/story/${newStoryId}`)}
            />
          </div>
        </TabsContent>

        <TabsContent value="compare" className="flex-1 min-h-0 m-0">
          <ComparePanel
            initialJobIdA={compareJobIdA}
            initialJobIdB={compareJobIdB}
            onJobIdsChange={(a, b) => {
              setCompareJobIdA(a);
              setCompareJobIdB(b);
            }}
          />
        </TabsContent>

        <TabsContent value="learning" className="flex-1 min-h-0 m-0">
          <LearningInspector />
        </TabsContent>
      </Tabs>
    </div>
  );
}
