// ============================================
// QA Inbox Data Hook
// ============================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Tables, Enums } from "@/integrations/supabase/types";

export type QAInboxItem = Tables<'script_runs'> & {
  account_vertical?: Enums<'content_vertical'>;
};

export type QAInboxTab = 'hard_block' | 'qa_failed';

export interface QAInboxFilters {
  tab: QAInboxTab;
  accountId?: string;
  vertical?: Enums<'content_vertical'> | 'all';
  search?: string;
}

// Fetch QA inbox items from DB
export function useQAInbox(filters: QAInboxFilters) {
  const { data: accountConfigs } = useAccountConfigs();
  const accountVerticalMap = new Map(
    (accountConfigs || []).map(a => [a.account_id, a.vertical])
  );

  return useQuery({
    queryKey: ['qa-inbox', filters],
    queryFn: async (): Promise<QAInboxItem[]> => {
      const query = supabase
        .from('script_runs')
        .select('*')
        .eq('status', 'qa_failed')
        .is('qa_override_at', null)
        .order('created_at', { ascending: false })
        .limit(100);

      if (filters.accountId && filters.accountId !== 'all') {
        query.eq('account_id', filters.accountId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Failed to fetch QA inbox:', error);
        throw error;
      }

      let results: QAInboxItem[] = (data || []).map(item => ({
        ...item,
        account_vertical: accountVerticalMap.get(item.account_id),
      }));

      // Filter by tab (hard blocks vs overridable)
      if (filters.tab === 'hard_block') {
        results = results.filter(item => 
          item.hard_block_flags && item.hard_block_flags.length > 0
        );
      } else {
        results = results.filter(item => 
          !item.hard_block_flags || item.hard_block_flags.length === 0
        );
      }

      // Filter by vertical
      if (filters.vertical && filters.vertical !== 'all') {
        results = results.filter(item => 
          item.account_vertical === filters.vertical
        );
      }

      // Search filter
      if (filters.search) {
        const search = filters.search.toLowerCase();
        results = results.filter(item => {
          const content = item.script_content as { hook?: string; voiceover?: string } | null;
          const searchFields = [
            content?.hook,
            content?.voiceover,
            item.qa_failed_reason,
            ...(item.safety_flags || []),
            ...(item.hard_block_flags || []),
          ].filter(Boolean).join(' ').toLowerCase();
          
          return searchFields.includes(search);
        });
      }

      return results;
    },
    staleTime: 30_000,
    enabled: !!accountConfigs,
  });
}

// Fetch account configs for filter dropdown
export function useAccountConfigs() {
  return useQuery({
    queryKey: ['account-configs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_configs')
        .select('account_id, vertical, persona')
        .order('account_id');

      if (error) {
        console.error('Failed to fetch account configs:', error);
        throw error;
      }

      return data || [];
    },
    staleTime: 5 * 60_000,
  });
}

// Get current user for authenticated actions
export function useCurrentUser() {
  return useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      return user;
    },
    staleTime: 5 * 60_000,
  });
}

// Override QA mutation - requires auth
export function useOverrideQA() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { 
      scriptId: string; 
      reason: string; 
    }) => {
      // Uses auth automatically via supabase client
      const { data, error } = await supabase.functions.invoke<{
        success: boolean;
        error?: string;
        request_id?: string;
      }>('override-qa', {
        body: {
          script_id: params.scriptId,
          reason: params.reason,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Override failed');
      
      return data;
    },
    onSuccess: () => {
      toast.success('Script approved via override');
      queryClient.invalidateQueries({ queryKey: ['qa-inbox'] });
      queryClient.invalidateQueries({ queryKey: ['qa-inbox-stats'] });
    },
    onError: (error) => {
      toast.error(`Override failed: ${error.message}`);
    },
  });
}

// Regenerate script mutation - requires auth, links to original
export function useRegenerateScript() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { 
      scriptId: string; 
      mode: 'ai' | 'template'; 
    }) => {
      const { data, error } = await supabase.functions.invoke<{
        success: boolean;
        script_run?: Tables<'script_runs'>;
        original_script_id?: string;
        error?: string;
        request_id?: string;
      }>('regenerate-script', {
        body: {
          script_id: params.scriptId,
          mode: params.mode,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Regeneration failed');
      
      return data;
    },
    onSuccess: (data) => {
      toast.success(`New script generated (linked to ${data.original_script_id?.slice(0, 8)}...)`);
      queryClient.invalidateQueries({ queryKey: ['qa-inbox'] });
      queryClient.invalidateQueries({ queryKey: ['qa-inbox-stats'] });
    },
    onError: (error) => {
      toast.error(`Regeneration failed: ${error.message}`);
    },
  });
}

// Get inbox stats - consistent hard block logic
export function useQAInboxStats() {
  return useQuery({
    queryKey: ['qa-inbox-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('script_runs')
        .select('id, hard_block_flags')
        .eq('status', 'qa_failed')
        .is('qa_override_at', null);

      if (error) {
        console.error('Failed to fetch inbox stats:', error);
        return { total: 0, hardBlocks: 0, overridable: 0 };
      }

      const items = data || [];
      // Same logic as list filter
      const hardBlocks = items.filter(i => 
        i.hard_block_flags && i.hard_block_flags.length > 0
      ).length;

      return {
        total: items.length,
        hardBlocks,
        overridable: items.length - hardBlocks,
      };
    },
    staleTime: 30_000,
  });
}
