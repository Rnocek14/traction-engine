import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, X, Download, Eye, Film } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { TodaysPlan } from "@/hooks/use-vertical-engine";

interface Props {
  plan: TodaysPlan;
  vertical: string;
}

export function ReviewQueue({ plan, vertical }: Props) {
  const queryClient = useQueryClient();

  const reviewAction = useMutation({
    mutationFn: async ({ jobId, action }: { jobId: string; action: "approved" | "rejected" }) => {
      const { error } = await supabase
        .from("story_jobs")
        .update({ review_status: action })
        .eq("id", jobId);
      if (error) throw error;
    },
    onSuccess: (_, { action }) => {
      toast.success(action === "approved" ? "Video approved!" : "Video rejected");
      queryClient.invalidateQueries({ queryKey: ["vertical-engine", vertical] });
    },
  });

  if (plan.pendingReview.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Film className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No videos waiting for review</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Eye className="w-4 h-4" />
          Ready for Review ({plan.pendingReview.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {plan.pendingReview.map(job => (
          <div key={job.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{job.title || "Untitled"}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {job.product_id && <Badge variant="outline" className="text-[10px]">Product</Badge>}
                  {job.content_type && <Badge variant="secondary" className="text-[10px]">{job.content_type}</Badge>}
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(job.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Video preview */}
            {job.assembled_video_url && (
              <video
                src={job.assembled_video_url}
                className="w-full max-h-[200px] rounded-md bg-black object-contain"
                controls
                preload="metadata"
              />
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="gap-1.5 h-7 text-xs flex-1"
                onClick={() => reviewAction.mutate({ jobId: job.id, action: "approved" })}
                disabled={reviewAction.isPending}
              >
                <CheckCircle className="w-3 h-3" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-7 text-xs flex-1"
                onClick={() => reviewAction.mutate({ jobId: job.id, action: "rejected" })}
                disabled={reviewAction.isPending}
              >
                <X className="w-3 h-3" /> Reject
              </Button>
              {job.assembled_video_url && (
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild>
                  <a href={job.assembled_video_url} download target="_blank" rel="noopener">
                    <Download className="w-3 h-3" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
