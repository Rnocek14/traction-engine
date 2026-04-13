import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ViralVideo {
  id: string;
  url: string;
  platform: string;
  views: number | null;
  likes: number | null;
  comments_count: number | null;
  shares: number | null;
  caption: string | null;
  creator_handle: string | null;
  extracted_product_name: string | null;
  extracted_product_description: string | null;
  linked_product_id: string | null;
  demand_signals: Record<string, unknown> | null;
  source_hook: string | null;
  hook_type: string | null;
  extraction_confidence: number | null;
  demand_score: number | null;
  engagement_rate: number | null;
  creative_strength_score: number | null;
  processing_status: string;
  processed_at: string | null;
  created_at: string;
}

export function useViralVideos(productId?: string) {
  return useQuery({
    queryKey: ["viral-videos", productId],
    queryFn: async () => {
      let query = supabase
        .from("viral_videos")
        .select("*")
        .order("created_at", { ascending: false });

      if (productId) {
        query = query.eq("linked_product_id", productId);
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      return (data || []) as unknown as ViralVideo[];
    },
  });
}

export function useIngestViralVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      url: string;
      caption?: string;
      views?: number;
      likes?: number;
      comments_count?: number;
      shares?: number;
      creator_handle?: string;
      link_product_id?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("ingest-viral-video", {
        body: params,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["viral-videos"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      if (data.already_exists) {
        toast.info("This video was already ingested");
      } else {
        const parts = [];
        if (data.extracted_product) parts.push(data.extracted_product);
        if (data.extraction_confidence) parts.push(`${data.extraction_confidence}% confidence`);
        if (data.demand_score) parts.push(`demand: ${data.demand_score}`);
        toast.success(
          parts.length > 0
            ? `Ingested! ${parts.join(" · ")}`
            : "Video ingested — no product detected"
        );
      }
    },
    onError: (e) => toast.error(`Ingest failed: ${e.message}`),
  });
}
