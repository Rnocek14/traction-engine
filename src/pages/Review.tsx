/**
 * Review - Human approval workspace
 * 
 * Two tabs:
 * 1. Assembled Videos - watch, approve/reject finished MP4s
 * 2. QA Scripts - existing script QA inbox
 */

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GlobalNav } from "@/components/GlobalNav";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { AssembledVideoCard } from "@/components/review/AssembledVideoCard";
import { useAssembledVideos } from "@/hooks/use-assembled-videos";
import { Film, ShieldCheck, RefreshCw, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

// Lazy import the QA inbox internals
import QAReviewInboxContent from "./QAReviewInbox";

export default function Review() {
  const [activeTab, setActiveTab] = useState("videos");
  const { data: videos = [], isLoading, refetch } = useAssembledVideos();
  const queryClient = useQueryClient();

  const succeededCount = videos.filter(v => v.assembled_status === "succeeded").length;
  const renderingCount = videos.filter(v => v.assembled_status === "rendering" || v.assembled_status === "queued").length;

  const handleApprove = async (id: string) => {
    // For now, just mark as noted - future: move to publishing queue
    toast.success("Video approved! Ready for posting.");
  };

  const handleReject = async (id: string) => {
    toast.info("Video rejected. Consider regenerating clips.");
  };

  const handleReassemble = async (id: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("assemble-reel", {
        body: { story_job_id: id },
      });
      if (error) throw error;
      toast.success("Reassembly triggered!");
      queryClient.invalidateQueries({ queryKey: ["assembled-videos"] });
    } catch (err: any) {
      toast.error(`Reassembly failed: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <GlobalNav />

      <header className="border-b border-border/50 bg-background/80">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-warning" />
                Review
              </h1>
              <p className="text-sm text-muted-foreground">
                Approve content before it goes live
              </p>
            </div>
            <div className="flex items-center gap-3">
              {succeededCount > 0 && (
                <Badge variant="outline" className="gap-1 text-green-500 border-green-500/30">
                  <Film className="w-3 h-3" />
                  {succeededCount} ready
                </Badge>
              )}
              {renderingCount > 0 && (
                <Badge variant="outline" className="gap-1 text-yellow-500 border-yellow-500/30">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  {renderingCount} rendering
                </Badge>
              )}
              <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Refresh
              </Button>
              <div className="h-6 w-px bg-border" />
              <AuthHeader />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
            <TabsTrigger value="videos" className="gap-2">
              <Film className="w-4 h-4" />
              Videos ({succeededCount})
            </TabsTrigger>
            <TabsTrigger value="scripts" className="gap-2">
              <ShieldCheck className="w-4 h-4" />
              Scripts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="videos" className="space-y-4">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="p-6">
                  <div className="flex gap-4">
                    <Skeleton className="w-[200px] h-[356px]" />
                    <div className="flex-1 space-y-3">
                      <Skeleton className="h-6 w-1/3" />
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-8 w-40 mt-8" />
                    </div>
                  </div>
                </Card>
              ))
            ) : videos.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center text-muted-foreground">
                  <Film className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium">No assembled videos yet</p>
                  <p className="text-sm">Videos will appear here after assembly completes</p>
                </CardContent>
              </Card>
            ) : (
              videos.map((video) => (
                <AssembledVideoCard
                  key={video.id}
                  video={video}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onReassemble={handleReassemble}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="scripts">
            <QAReviewInboxContent />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
