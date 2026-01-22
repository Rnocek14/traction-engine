// ============================================
// Script Runs - DB-Native Operations
// ============================================
import { supabase } from "@/integrations/supabase/client";
import type { 
  ScriptContent, 
  QAResult,
  ContentVertical
} from "@/types/script-types";
import type { Tables, Enums } from "@/integrations/supabase/types";

// ============================================
// Types - Use DB types for operations
// ============================================
export type DbAccountConfig = Tables<'account_configs'>;
export type DbContentPolicy = Tables<'content_policies'>;
export type DbTopic = Tables<'topic_bank'>;
export type DbScriptRun = Tables<'script_runs'>;

export interface CreateScriptOptions {
  accountId: string;
  preferredPillar?: string;
  mode: 'ai' | 'template';
}

export interface ScriptRunResult {
  success: boolean;
  scriptRun?: DbScriptRun;
  error?: string;
  warnings: string[];
}

// ============================================
// Fetch Account Config from DB (read-only)
// ============================================
export async function fetchAccountConfig(accountId: string): Promise<DbAccountConfig | null> {
  const { data, error } = await supabase
    .from('account_configs')
    .select('*')
    .eq('account_id', accountId)
    .single();

  if (error || !data) {
    console.error('Failed to fetch account config:', error);
    return null;
  }

  return data;
}

// ============================================
// Fetch Content Policy from DB (read-only)
// ============================================
export async function fetchContentPolicy(vertical: ContentVertical): Promise<DbContentPolicy | null> {
  const { data, error } = await supabase
    .from('content_policies')
    .select('*')
    .eq('vertical', vertical)
    .single();

  if (error || !data) {
    console.error('Failed to fetch content policy:', error);
    return null;
  }

  return data;
}

// ============================================
// Select Topic from DB (read-only, for display)
// ============================================
export async function selectTopicFromDB(
  vertical: ContentVertical,
  preferredPillar?: string
): Promise<DbTopic | null> {
  const { data, error } = await supabase.rpc('select_topic', {
    p_vertical: vertical,
    p_pillar: preferredPillar ?? null,
  });

  if (error) {
    console.error('Failed to select topic via RPC:', error);
    return null;
  }

  const topic = Array.isArray(data) ? data[0] : data;
  return topic || null;
}

// ============================================
// Fetch Recent Fingerprints from DB (read-only)
// ============================================
export async function fetchRecentFingerprints(
  accountId: string,
  days: number = 30
): Promise<{ hook_hash: string; voiceover_hash: string }[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const { data, error } = await supabase
    .from('script_fingerprints')
    .select('hook_hash, voiceover_hash')
    .eq('account_id', accountId)
    .gte('created_at', cutoffDate.toISOString())
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Failed to fetch fingerprints:', error);
    return [];
  }

  return data || [];
}

// ============================================
// Create Script Run via Edge Function
// All DB writes happen server-side with service_role
// ============================================
export async function createScriptRun(options: CreateScriptOptions): Promise<ScriptRunResult> {
  try {
    const pipelineKey = import.meta.env.VITE_PIPELINE_KEY;
    
    const { data, error } = await supabase.functions.invoke<{
      success: boolean;
      script_run?: DbScriptRun;
      error?: string;
      warnings: string[];
    }>('generate-script', {
      headers: pipelineKey ? { 'x-pipeline-key': pipelineKey } : undefined,
      body: {
        account_id: options.accountId,
        preferred_pillar: options.preferredPillar,
        mode: options.mode,
      },
    });

    if (error) {
      console.error('Edge function error:', error);
      return {
        success: false,
        error: error.message || 'Failed to call generate-script function',
        warnings: [],
      };
    }

    if (!data) {
      return {
        success: false,
        error: 'No data returned from edge function',
        warnings: [],
      };
    }

    return {
      success: data.success,
      scriptRun: data.script_run,
      error: data.error,
      warnings: data.warnings || [],
    };
  } catch (err) {
    console.error('Error calling generate-script:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      warnings: [],
    };
  }
}

// ============================================
// List Script Runs from DB (read-only)
// ============================================
export async function listScriptRuns(options: {
  accountId?: string;
  status?: Enums<'script_status'>;
  limit?: number;
} = {}): Promise<DbScriptRun[]> {
  let query = supabase
    .from('script_runs')
    .select('*')
    .order('created_at', { ascending: false });

  if (options.accountId) {
    query = query.eq('account_id', options.accountId);
  }

  if (options.status) {
    query = query.eq('status', options.status);
  }

  query = query.limit(options.limit || 50);

  const { data, error } = await query;

  if (error) {
    console.error('Failed to list script runs:', error);
    return [];
  }

  return data || [];
}

// ============================================
// List QA Inbox (read-only)
// ============================================
export async function listQaInbox(options: {
  vertical?: ContentVertical;
  search?: string;
  limit?: number;
} = {}): Promise<DbScriptRun[]> {
  let query = supabase
    .from('script_runs')
    .select('*')
    .eq('status', 'qa_failed' as Enums<'script_status'>)
    .is('qa_override_at', null)
    .order('created_at', { ascending: false });

  query = query.limit(options.limit || 50);

  const { data, error } = await query;

  if (error) {
    console.error('Failed to list QA inbox:', error);
    return [];
  }

  let results = data || [];

  // Filter by search term
  if (options.search) {
    const search = options.search.toLowerCase();
    results = results.filter(run => {
      const content = run.script_content as unknown as ScriptContent;
      return (
        content?.hook?.toLowerCase().includes(search) ||
        run.qa_failed_reason?.toLowerCase().includes(search) ||
        run.safety_flags.some(f => f.toLowerCase().includes(search))
      );
    });
  }

  return results;
}

// ============================================
// Override QA via Edge Function
// ============================================
export async function overrideQa(options: {
  scriptId: string;
  overrideBy: string;
  reason: string;
}): Promise<{ success: boolean; error?: string }> {
  // For now, we still need a separate edge function for this
  // First check hard blocks client-side
  const { data: script, error: fetchError } = await supabase
    .from('script_runs')
    .select('hard_block_flags, status')
    .eq('id', options.scriptId)
    .single();

  if (fetchError || !script) {
    return { success: false, error: 'Script not found' };
  }

  if (script.hard_block_flags && script.hard_block_flags.length > 0) {
    return { 
      success: false, 
      error: `Cannot override: hard block flags present (${script.hard_block_flags.join(', ')})` 
    };
  }

  if (script.status !== 'qa_failed') {
    return { success: false, error: 'Script is not in qa_failed status' };
  }

  // Call edge function for the actual update
  const pipelineKey = import.meta.env.VITE_PIPELINE_KEY;
  
  const { data, error } = await supabase.functions.invoke<{
    success: boolean;
    error?: string;
  }>('override-qa', {
    headers: pipelineKey ? { 'x-pipeline-key': pipelineKey } : undefined,
    body: {
      script_id: options.scriptId,
      override_by: options.overrideBy,
      reason: options.reason,
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return data || { success: false, error: 'No response' };
}

// ============================================
// Regenerate Script
// ============================================
export async function regenerateScript(options: {
  scriptId: string;
  mode: 'ai' | 'template';
}): Promise<ScriptRunResult> {
  // Fetch the original script to get account
  const { data: original, error } = await supabase
    .from('script_runs')
    .select('account_id')
    .eq('id', options.scriptId)
    .single();

  if (error || !original) {
    return { success: false, error: 'Original script not found', warnings: [] };
  }

  return createScriptRun({
    accountId: original.account_id,
    mode: options.mode,
  });
}

// ============================================
// List Account Configs from DB (read-only)
// ============================================
export async function listAccountConfigs(): Promise<DbAccountConfig[]> {
  const { data, error } = await supabase
    .from('account_configs')
    .select('*')
    .order('account_id');

  if (error) {
    console.error('Failed to list account configs:', error);
    return [];
  }

  return data || [];
}

// ============================================
// List Available Pillars from DB (read-only)
// ============================================
export async function listAvailablePillars(vertical: ContentVertical): Promise<string[]> {
  const { data, error } = await supabase
    .from('topic_bank')
    .select('pillar')
    .eq('vertical', vertical);

  if (error) {
    console.error('Failed to list pillars:', error);
    return [];
  }

  const pillars = [...new Set(data?.map(t => t.pillar) || [])];
  return pillars.sort();
}