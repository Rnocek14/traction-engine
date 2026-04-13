/**
 * PerformanceIngestForm
 * 
 * Inline form to manually input post-publish metrics for a video.
 * Calls the ingest-performance edge function.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BarChart3, Loader2 } from "lucide-react";

interface PerformanceIngestFormProps {
  storyJobId: string;
  onSuccess?: () => void;
}

export function PerformanceIngestForm({ storyJobId, onSuccess }: PerformanceIngestFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [platform, setPlatform] = useState("tiktok");
  const [fields, setFields] = useState({
    views: "",
    likes: "",
    shares: "",
    saves: "",
    comments: "",
    avg_watch_time: "",
    watch_3s_rate: "",
    watch_15s_rate: "",
    external_post_id: "",
  });

  const handleChange = (key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        story_job_id: storyJobId,
        platform,
      };

      // Only include non-empty numeric fields
      for (const [key, val] of Object.entries(fields)) {
        if (val.trim() !== "") {
          if (key === "external_post_id") {
            body[key] = val.trim();
          } else {
            const num = Number(val);
            if (!isNaN(num)) body[key] = num;
          }
        }
      }

      const { data, error } = await supabase.functions.invoke("ingest-performance", {
        body,
      });

      if (error) throw error;

      toast.success(`Performance logged — Score: ${data?.outcome_score ?? "N/A"}`);
      setOpen(false);
      onSuccess?.();
    } catch (err) {
      toast.error("Failed to log performance");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <BarChart3 className="w-4 h-4" />
        Log Performance
      </Button>
    );
  }

  return (
    <div className="rounded-md border border-border bg-secondary/30 p-4 space-y-3 mt-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-primary" />
          Log Post Performance
        </h4>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Platform</Label>
          <Select value={platform} onValueChange={setPlatform}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tiktok">TikTok</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="youtube">YouTube</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Views</Label>
          <Input
            type="number"
            className="h-8 text-xs"
            placeholder="0"
            value={fields.views}
            onChange={(e) => handleChange("views", e.target.value)}
          />
        </div>

        <div>
          <Label className="text-xs">Likes</Label>
          <Input
            type="number"
            className="h-8 text-xs"
            placeholder="0"
            value={fields.likes}
            onChange={(e) => handleChange("likes", e.target.value)}
          />
        </div>

        <div>
          <Label className="text-xs">Shares</Label>
          <Input
            type="number"
            className="h-8 text-xs"
            placeholder="0"
            value={fields.shares}
            onChange={(e) => handleChange("shares", e.target.value)}
          />
        </div>

        <div>
          <Label className="text-xs">Saves</Label>
          <Input
            type="number"
            className="h-8 text-xs"
            placeholder="0"
            value={fields.saves}
            onChange={(e) => handleChange("saves", e.target.value)}
          />
        </div>

        <div>
          <Label className="text-xs">Comments</Label>
          <Input
            type="number"
            className="h-8 text-xs"
            placeholder="0"
            value={fields.comments}
            onChange={(e) => handleChange("comments", e.target.value)}
          />
        </div>

        <div>
          <Label className="text-xs">Avg Watch (sec)</Label>
          <Input
            type="number"
            step="0.1"
            className="h-8 text-xs"
            placeholder="0"
            value={fields.avg_watch_time}
            onChange={(e) => handleChange("avg_watch_time", e.target.value)}
          />
        </div>

        <div>
          <Label className="text-xs">3s Retention %</Label>
          <Input
            type="number"
            step="0.1"
            className="h-8 text-xs"
            placeholder="0-100"
            value={fields.watch_3s_rate}
            onChange={(e) => handleChange("watch_3s_rate", e.target.value)}
          />
        </div>

        <div>
          <Label className="text-xs">Post ID</Label>
          <Input
            type="text"
            className="h-8 text-xs"
            placeholder="Optional"
            value={fields.external_post_id}
            onChange={(e) => handleChange("external_post_id", e.target.value)}
          />
        </div>
      </div>

      <Button
        size="sm"
        onClick={handleSubmit}
        disabled={loading || !fields.views}
        className="gap-1.5"
      >
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        Submit Metrics
      </Button>
    </div>
  );
}
