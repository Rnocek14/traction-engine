import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Video, Check, X, Play, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { useGenerateVideoConcepts, useQueueVideoConcepts, useProductStoryJobs, type VideoConcept } from "@/hooks/use-product-videos";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const ANGLE_COLORS: Record<string, string> = {
  "Problem → Solution": "bg-red-500/10 text-red-500",
  "Curiosity Hook": "bg-purple-500/10 text-purple-500",
  "Social Proof": "bg-blue-500/10 text-blue-500",
  "Comparison": "bg-orange-500/10 text-orange-500",
  "Visual Demo": "bg-green-500/10 text-green-500",
};

const FORMAT_LABELS: Record<string, string> = {
  slideshow_ad: "Slideshow",
  ugc_review: "UGC Review",
  problem_solution: "Problem/Solution",
  comparison: "Comparison",
  curiosity_reveal: "Curiosity Reveal",
};

export function ProductVideosSection({ productId }: { productId: string }) {
  const [concepts, setConcepts] = useState<VideoConcept[]>([]);
  const [approved, setApproved] = useState<Set<number>>(new Set());
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  
  const generateMutation = useGenerateVideoConcepts();
  const queueMutation = useQueueVideoConcepts();
  const existingJobs = useProductStoryJobs(productId);

  const { data: accounts } = useQuery({
    queryKey: ["accounts-for-video"],
    queryFn: async () => {
      const { data } = await supabase
        .from("account_configs")
        .select("account_id, account_name, vertical")
        .eq("status", "active")
        .order("priority_score", { ascending: false });
      return data || [];
    },
  });

  const handleGenerate = async () => {
    const result = await generateMutation.mutateAsync(productId);
    setConcepts(result.concepts);
    setApproved(new Set(result.concepts.map((_, i) => i))); // approve all by default
  };

  const toggleApproval = (idx: number) => {
    setApproved(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleQueue = async () => {
    if (!selectedAccountId) return;
    const approvedConcepts = concepts.filter((_, i) => approved.has(i));
    if (approvedConcepts.length === 0) return;
    
    await queueMutation.mutateAsync({
      productId,
      concepts: approvedConcepts,
      accountId: selectedAccountId,
    });
    
    setConcepts([]);
    setApproved(new Set());
    existingJobs.refetch();
  };

  const jobs = existingJobs.data || [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Video className="w-5 h-5" />
            Video Concepts
          </CardTitle>
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-1" />
            )}
            {concepts.length > 0 ? "Regenerate" : "Generate Concepts"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Concept preview cards */}
        {concepts.length > 0 && (
          <>
            <p className="text-sm text-muted-foreground">
              Review and approve concepts before queueing. Each uses a different angle for diversity.
            </p>
            <div className="space-y-3">
              {concepts.map((concept, idx) => (
                <div
                  key={idx}
                  className={`border rounded-lg p-3 transition-colors ${
                    approved.has(idx) ? "border-primary/50 bg-primary/5" : "border-border opacity-60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={ANGLE_COLORS[concept.angle] || "text-muted-foreground"}>
                          {concept.angle}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {FORMAT_LABELS[concept.format] || concept.format}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {concept.scenes.length} scenes · {concept.scenes.reduce((s, sc) => s + sc.duration, 0)}s
                        </span>
                      </div>
                      <p className="text-sm font-medium mt-1 truncate">"{concept.hook}"</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                      >
                        {expandedIdx === idx ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant={approved.has(idx) ? "default" : "outline"}
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => toggleApproval(idx)}
                      >
                        {approved.has(idx) ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                  
                  {expandedIdx === idx && (
                    <div className="mt-3 space-y-2 text-sm border-t pt-3">
                      <div>
                        <span className="font-medium text-muted-foreground">Voiceover:</span>
                        <p className="mt-0.5">{concept.voiceover}</p>
                      </div>
                      <div>
                        <span className="font-medium text-muted-foreground">Scenes:</span>
                        <div className="mt-1 space-y-1">
                          {concept.scenes.map((scene, si) => (
                            <div key={si} className="flex items-start gap-2 text-xs bg-muted/50 rounded p-2">
                              <Badge variant="outline" className="text-[10px] shrink-0">
                                {scene.type === "image_motion" ? "📷" : scene.type === "ai_generated" ? "🎬" : "📝"} {scene.duration}s
                              </Badge>
                              <span className="text-muted-foreground">{scene.prompt}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <div>
                          <span className="font-medium text-muted-foreground">CTA:</span> {concept.cta}
                        </div>
                      </div>
                      <div>
                        <span className="font-medium text-muted-foreground">Caption:</span>
                        <p className="mt-0.5 text-xs text-muted-foreground">{concept.caption}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Queue controls */}
            <div className="flex items-center gap-3 pt-2 border-t">
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {(accounts || []).map(a => (
                    <SelectItem key={a.account_id} value={a.account_id}>
                      {a.account_name || a.account_id} ({a.vertical})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleQueue}
                disabled={approved.size === 0 || !selectedAccountId || queueMutation.isPending}
              >
                {queueMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <Play className="w-4 h-4 mr-1" />
                )}
                Queue {approved.size} Video{approved.size !== 1 ? "s" : ""}
              </Button>
            </div>
          </>
        )}

        {/* Existing jobs */}
        {jobs.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Previous Videos</h4>
            {jobs.map(job => (
              <div key={job.id} className="flex items-center justify-between text-sm border rounded p-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className="text-xs shrink-0">{job.status}</Badge>
                  <span className="truncate">{job.title || "Untitled"}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                  {job.completed_clips}/{job.total_clips} clips
                  {job.assembled_status === "succeeded" && (
                    <Badge className="bg-green-500/10 text-green-500 text-[10px]">Assembled</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {concepts.length === 0 && jobs.length === 0 && !generateMutation.isPending && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Generate AI video concepts from this product's images and marketing plan.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
