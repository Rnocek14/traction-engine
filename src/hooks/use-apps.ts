import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type App = {
  id: string;
  name: string;
  url: string | null;
  cta_url: string | null;
  description: string | null;
  value_prop: string | null;
  target_audience: string | null;
  pricing_model: string | null;
  icon_url: string | null;
  verticals: string[];
  readiness_score: number;
  hooks: string[];
  screenshots: string[];
  marketing_plan: Record<string, unknown>;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export function useApps(vertical?: string) {
  return useQuery({
    queryKey: ["apps", vertical ?? "all"],
    queryFn: async () => {
      let q = supabase.from("apps").select("*").order("readiness_score", { ascending: false });
      if (vertical) q = q.contains("verticals", [vertical]);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as App[];
    },
  });
}

export function useApp(id: string | undefined) {
  return useQuery({
    queryKey: ["app", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("apps").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as App | null;
    },
  });
}

export function useUpsertApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<App> & { name: string }) => {
      const { data, error } = await supabase
        .from("apps")
        .upsert(input as never, { onConflict: "id" })
        .select()
        .single();
      if (error) throw error;
      return data as App;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["apps"] });
      toast.success("App saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("apps").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["apps"] });
      toast.success("App deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
