import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type SystemSettings = {
  id: string;
  automation_enabled: boolean;
  daily_spend_cap_cents: number;
  per_story_cap_cents: number;
  per_product_cap_cents: number;
  paused_reason: string | null;
  paused_at: string | null;
  paused_by: string | null;
  updated_at: string;
};

export type SpendSummary = {
  today_cents: number;
  today_calls: number;
  last_7d_cents: number;
  last_30d_cents: number;
  legacy_total_cents: number;
  by_provider: { provider: string; cost_cents: number; calls: number }[];
  by_function: { function_name: string; cost_cents: number; calls: number }[];
  daily: { day: string; cost_cents: number; calls: number }[];
  top_stories: { story_job_id: string; cost_cents: number; calls: number }[];
  queues: {
    video_jobs: Record<string, number>;
    story_jobs: Record<string, number>;
    compare_queue: Record<string, number>;
  };
};

export function useSystemSettings() {
  return useQuery({
    queryKey: ["system-settings"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as never as {
        from: (t: string) => { select: (s: string) => { limit: (n: number) => { maybeSingle: () => Promise<{ data: SystemSettings | null; error: Error | null }> } } };
      }).from("system_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateSystemSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<SystemSettings> & { id: string }) => {
      const { error } = await (supabase as never as {
        from: (t: string) => { update: (v: object) => { eq: (k: string, v: string) => Promise<{ error: Error | null }> } };
      }).from("system_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", patch.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["system-settings"] });
      toast.success("Settings saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useSpendSummary() {
  return useQuery({
    queryKey: ["spend-summary"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as never as {
        rpc: (fn: string) => Promise<{ data: SpendSummary | null; error: Error | null }>;
      }).rpc("get_spend_summary");
      if (error) throw error;
      return data as SpendSummary;
    },
  });
}

export function useRecentApiCalls(limit = 50) {
  return useQuery({
    queryKey: ["api-call-log", limit],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as never as {
        from: (t: string) => { select: (s: string) => { order: (k: string, o: object) => { limit: (n: number) => Promise<{ data: unknown[] | null; error: Error | null }> } } };
      }).from("api_call_log").select("*").order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; created_at: string; provider: string; function_name: string;
        status: string; cost_cents: number; latency_ms: number | null; error_message: string | null;
      }>;
    },
  });
}

export type UpcomingWork = {
  totals: {
    accounts_with_backlog: number;
    stories_pending: number;
    videos_active: number;
    ideas_proposed: number;
    worst_case_cents: number;
  };
  accounts: Array<{
    account_id: string;
    stories_draft: number;
    stories_generating: number;
    stories_partial: number;
    stories_total: number;
    oldest_pending_at: string | null;
    videos_active: number;
    videos_queued: number;
    videos_running: number;
    videos_active_est_cents: number;
    ideas_proposed: number;
    worst_case_cents: number;
  }>;
};

export function useUpcomingWork() {
  return useQuery({
    queryKey: ["upcoming-work"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as never as {
        rpc: (fn: string) => Promise<{ data: UpcomingWork | null; error: Error | null }>;
      }).rpc("get_upcoming_work_by_account");
      if (error) throw error;
      return data as UpcomingWork;
    },
  });
}

export const fmtUsd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
