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
  // First fetch account configs for vertical mapping
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

      // Filter by account
      if (filters.accountId && filters.accountId !== 'all') {
        query.eq('account_id', filters.accountId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Failed to fetch QA inbox:', error);
        throw error;
      }

      // Enrich with vertical from account configs
      let results: QAInboxItem[] = (data || []).map(item => ({
        ...item,
        account_vertical: accountVerticalMap.get(item.account_id),
      }));

      // Filter by tab (hard blocks vs overridable) - client side
      if (filters.tab === 'hard_block') {
        results = results.filter(item => 
          item.hard_block_flags && item.hard_block_flags.length > 0
        );
      } else {
        results = results.filter(item => 
          !item.hard_block_flags || item.hard_block_flags.length === 0
        );
      }

      // Filter by vertical (client-side)
      if (filters.vertical && filters.vertical !== 'all') {
        results = results.filter(item => 
          item.account_vertical === filters.vertical
        );
      }

      // Search filter (client-side)
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
    staleTime: 30_000, // 30 seconds
    enabled: !!accountConfigs, // Wait for account configs
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
    staleTime: 5 * 60_000, // 5 minutes
  });
}

// Override QA mutation
export function useOverrideQA() {
  const queryClient = useQueryClient();
  const pipelineKey = import.meta.env.VITE_PIPELINE_KEY;

  return useMutation({
    mutationFn: async (params: { 
      scriptId: string; 
      overrideBy: string; 
      reason: string; 
    }) => {
      const { data, error } = await supabase.functions.invoke<{
        success: boolean;
        error?: string;
        request_id?: string;
      }>('override-qa', {
        headers: pipelineKey ? { 'x-pipeline-key': pipelineKey } : undefined,
        body: {
          script_id: params.scriptId,
          override_by: params.overrideBy,
          reason: params.reason,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Override failed');
      
      return data;
    },
    onSuccess: (_, variables) => {
      toast.success('Script approved via override');
      queryClient.invalidateQueries({ queryKey: ['qa-inbox'] });
    },
    onError: (error) => {
      toast.error(`Override failed: ${error.message}`);
    },
  });
}

// Regenerate script mutation
export function useRegenerateScript() {
  const queryClient = useQueryClient();
  const pipelineKey = import.meta.env.VITE_PIPELINE_KEY;

  return useMutation({
    mutationFn: async (params: { 
      accountId: string; 
      mode: 'ai' | 'template'; 
    }) => {
      const { data, error } = await supabase.functions.invoke<{
        success: boolean;
        script_run?: Tables<'script_runs'>;
        error?: string;
        request_id?: string;
      }>('generate-script', {
        headers: pipelineKey ? { 'x-pipeline-key': pipelineKey } : undefined,
        body: {
          account_id: params.accountId,
          mode: params.mode,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Generation failed');
      
      return data;
    },
    onSuccess: () => {
      toast.success('New script generated');
      queryClient.invalidateQueries({ queryKey: ['qa-inbox'] });
    },
    onError: (error) => {
      toast.error(`Regeneration failed: ${error.message}`);
    },
  });
}

// Get inbox stats
export function useQAInboxStats() {
  return useQuery({
    queryKey: ['qa-inbox-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('script_runs')
        .select('id, hard_block_flags, safety_flags')
        .eq('status', 'qa_failed')
        .is('qa_override_at', null);

      if (error) {
        console.error('Failed to fetch inbox stats:', error);
        return { total: 0, hardBlocks: 0, overridable: 0 };
      }

      const items = data || [];
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
