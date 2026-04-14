import { useState } from "react";
import { GlobalNav } from "@/components/GlobalNav";
import { SummaryBar } from "@/components/today/SummaryBar";
import { AccountRow } from "@/components/today/AccountRow";
import { PostDetailDrawer } from "@/components/today/PostDetailDrawer";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useTodayFeed, type PostSlot } from "@/hooks/use-today-feed";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { LayoutList, LayoutGrid } from "lucide-react";

export default function Today() {
  const { data, isLoading } = useTodayFeed();
  const [compact, setCompact] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<PostSlot | null>(null);
  const [producingIds, setProducingIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const feed = data?.feed || [];
  const summary = data?.summary || { totalReady: 0, totalGenerating: 0, totalIdeasLow: 0, totalApproved: 0 };

  // Group accounts by vertical
  const grouped = feed.reduce<Record<string, typeof feed>>((acc, item) => {
    (acc[item.vertical] ??= []).push(item);
    return acc;
  }, {});

  const handleApprove = async (jobId: string) => {
    const { error } = await supabase
      .from("story_jobs")
      .update({ review_status: "approved" })
      .eq("id", jobId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Approved" });
      queryClient.invalidateQueries({ queryKey: ["today-feed"] });
    }
  };

  const handleReject = async (jobId: string) => {
    const { error } = await supabase
      .from("story_jobs")
      .update({ review_status: "rejected" })
      .eq("id", jobId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Rejected" });
      queryClient.invalidateQueries({ queryKey: ["today-feed"] });
    }
  };

  const handleProduce = async (ideaId: string) => {
    setProducingIds(prev => new Set(prev).add(ideaId));
    toast({ title: "Producing…", description: "Generating storyboard from idea" });
    
    try {
      // Step 1: Fetch the idea to get concept info
      const { data: idea, error: ideaErr } = await supabase
        .from("content_ideas")
        .select("title, account_id, content_type, subject, angle")
        .eq("id", ideaId)
        .single();
      
      if (ideaErr || !idea) {
        toast({ title: "Error", description: "Could not load idea", variant: "destructive" });
        return;
      }

      // Step 2: Generate storyboard from the idea concept
      const concept = `${idea.title}${idea.angle ? ` — ${idea.angle}` : ""}${idea.subject ? `. Subject: ${idea.subject}` : ""}`;
      const contentType = idea.content_type === "product_promo" ? "product_promo" : "growth";
      const { data: storyboard, error: sbErr } = await supabase.functions.invoke("generate-storyboard", {
        body: { concept, story_type: "short_story", scene_count: 5, content_type: contentType },
      });

      if (sbErr || !storyboard?.scenes?.length) {
        toast({ title: "Error", description: "Storyboard generation failed", variant: "destructive" });
        return;
      }

      // Step 3: Create story job with the generated storyboard
      const { error: createErr } = await supabase.functions.invoke("create-story", {
        body: {
          title: idea.title,
          account_id: idea.account_id,
          story_type: "short_story",
          continuity_anchors: {},
          storyboard_json: { scenes: storyboard.scenes },
          auto_generate: true,
          content_idea_id: ideaId,
          content_type: contentType,
        },
      });

      if (createErr) {
        toast({ title: "Error", description: createErr.message, variant: "destructive" });
      } else {
        toast({ title: "Story created & generating!" });
        queryClient.invalidateQueries({ queryKey: ["today-feed"] });
      }
    } finally {
      setProducingIds(prev => {
        const next = new Set(prev);
        next.delete(ideaId);
        return next;
      });
    }
  };

  const handleRegenerate = async (jobId: string) => {
    setProducingIds(prev => new Set(prev).add(jobId));
    toast({ title: "Regenerating…", description: "Creating new video clips for this story" });
    
    try {
      // Fetch the existing story job to get its config
      const { data: job, error: jobErr } = await supabase
        .from("story_jobs")
        .select("title, account_id, story_type, storyboard_json, content_type")
        .eq("id", jobId)
        .single();

      if (jobErr || !job) {
        toast({ title: "Error", description: "Could not load story job", variant: "destructive" });
        return;
      }

      // Create a new story job with same config but fresh generation
      const { error: createErr } = await supabase.functions.invoke("create-story", {
        body: {
          title: job.title,
          account_id: job.account_id,
          story_type: job.story_type || "short_story",
          continuity_anchors: {},
          storyboard_json: job.storyboard_json,
          auto_generate: true,
          content_type: job.content_type || "growth",
        },
      });

      if (createErr) {
        toast({ title: "Error", description: createErr.message, variant: "destructive" });
      } else {
        toast({ title: "Regenerating!", description: "New clips are being generated" });
        queryClient.invalidateQueries({ queryKey: ["today-feed"] });
      }
    } finally {
      setProducingIds(prev => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  };

  const handleGenerateIdeas = async (accountId: string) => {
    toast({ title: "Generating ideas…" });
    const { error } = await supabase.functions.invoke("generate-ideas", {
      body: { account_id: accountId },
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Ideas generated" });
      queryClient.invalidateQueries({ queryKey: ["today-feed"] });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <GlobalNav />
      <main className="container mx-auto px-4 md:px-6 py-6 space-y-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Today</h1>
            <p className="text-sm text-muted-foreground">What needs to be posted today</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-muted-foreground" />
              <Switch id="compact" checked={compact} onCheckedChange={setCompact} />
              <Label htmlFor="compact" className="text-xs cursor-pointer">
                <LayoutList className="w-4 h-4" />
              </Label>
            </div>
          </div>
        </div>

        {/* Summary */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : (
          <SummaryBar summary={summary} />
        )}

        {/* Account Feed grouped by vertical */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg font-medium">No active accounts</p>
            <p className="text-sm mt-1">Set up accounts in the Verticals section to get started.</p>
            <Button variant="outline" className="mt-4" onClick={() => window.location.href = "/verticals"}>
              Go to Verticals
            </Button>
          </div>
        ) : (
          Object.entries(grouped).map(([vertical, items]) => (
            <section key={vertical} className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{vertical}</h2>
              <div className="space-y-2">
                {items.map((item) => (
                  <AccountRow
                    key={item.accountId}
                    item={item}
                    compact={compact}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onProduce={handleProduce}
                    onRegenerate={handleRegenerate}
                    onGenerateIdeas={handleGenerateIdeas}
                    onSlotClick={setSelectedSlot}
                    producingIds={producingIds}
                  />
                ))}
              </div>
            </section>
          ))
        )}
        {/* Post Detail Drawer */}
        <PostDetailDrawer
          open={!!selectedSlot}
          onOpenChange={(open) => { if (!open) setSelectedSlot(null); }}
          storyJobId={selectedSlot?.storyJobId || null}
          ideaId={selectedSlot?.ideaId}
        />
      </main>
    </div>
  );
}
