import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useAccounts() {
  return useQuery({
    queryKey: ["account-configs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_configs")
        .select("*")
        .order("priority_score", { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

export function useAccount(accountId: string) {
  return useQuery({
    queryKey: ["account-config", accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_configs")
        .select("*")
        .eq("account_id", accountId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!accountId,
  });
}
