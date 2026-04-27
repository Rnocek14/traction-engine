import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type AppAngle = {
  id: string;
  app_id: string;
  name: string;
  emotion: string;
  hypothesis: string | null;
  hook_examples: string[];
  cta_style: string;
  target_audience: string | null;
  status: "testing" | "winner" | "loser" | "paused";
  videos_count: number;
  avg_outcome_score: number | null;
  total_clicks: number;
  total_signups: number;
  total_revenue_cents: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export function useAppAngles(appId: string | undefined) {
  return useQuery({
    queryKey: ["app-angles", appId ?? "all"],
    queryFn: async () => {
      let q = (supabase as any).from("app_angles").select("*").order("created_at", { ascending: true });
      if (appId) q = q.eq("app_id", appId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AppAngle[];
    },
    enabled: appId !== null,
  });
}

export function useUpsertAppAngle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<AppAngle> & { app_id: string; name: string }) => {
      const { data, error } = await (supabase as any)
        .from("app_angles")
        .upsert(input, { onConflict: "id" })
        .select()
        .single();
      if (error) throw error;
      return data as AppAngle;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["app-angles"] });
      qc.invalidateQueries({ queryKey: ["app-angles", vars.app_id] });
      toast.success("Angle saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteAppAngle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("app_angles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-angles"] });
      toast.success("Angle deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Pull live performance for an angle by joining story_jobs + prompt_outcomes. */
export function useAngleScoreboard(appId: string | undefined) {
  return useQuery({
    queryKey: ["angle-scoreboard", appId],
    enabled: !!appId,
    queryFn: async () => {
      // Get angles
      const { data: angles, error: aErr } = await (supabase as any)
        .from("app_angles")
        .select("id, name, emotion, status")
        .eq("app_id", appId);
      if (aErr) throw aErr;

      const ids = (angles ?? []).map((a: any) => a.id);
      if (ids.length === 0) return [];

      // Story jobs grouped by angle
      const { data: jobs } = await (supabase as any)
        .from("story_jobs")
        .select("id, app_angle_id, assembled_status, review_status, assembled_video_url")
        .in("app_angle_id", ids);

      const stats = new Map<string, { videos: number; assembled: number; approved: number }>();
      (jobs ?? []).forEach((j: any) => {
        const s = stats.get(j.app_angle_id) ?? { videos: 0, assembled: 0, approved: 0 };
        s.videos += 1;
        if (j.assembled_status === "succeeded") s.assembled += 1;
        if (j.review_status === "approved") s.approved += 1;
        stats.set(j.app_angle_id, s);
      });

      return (angles ?? []).map((a: any) => ({
        ...a,
        ...(stats.get(a.id) ?? { videos: 0, assembled: 0, approved: 0 }),
      }));
    },
  });
}
